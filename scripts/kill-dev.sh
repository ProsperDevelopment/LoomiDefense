#!/usr/bin/env bash
# ============================================================
# Kill the local dev servers so `docker-compose up` can bind
# its ports.
#
#   npm run kill-dev                 # default ports (see below)
#   ./scripts/kill-dev.sh 80 4000    # only these ports
#   ./scripts/kill-dev.sh --list     # show what is listening
#   ./scripts/kill-dev.sh --dry-run  # show what would be killed
#   ./scripts/kill-dev.sh --force    # SIGKILL immediately
#   ./scripts/kill-dev.sh --all      # + every dev.mjs session of this
#                                    #   project, even idle ones
#   ./scripts/kill-dev.sh --any      # + non-dev processes on the ports
#
# Default ports: 80 (web) 3000 (vite) 4000 (game API/WS) 4001 (music)
#
# Safety: only your own processes, never this script's own tree and
# never a process running inside a container (root/container/docker
# listeners are reported - use `docker-compose down` for those).
# ============================================================
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_PORTS=(80 3000 4000 4001)
DEV_RE='dev\.mjs|node_modules/\.bin/(vite|tsx)|npm run (dev|server)|server/index\.ts|LoomiMusicMixServer|[ /]vite( |$)|[ /]tsx( |$)|npx serve'

FORCE=0 DRY_RUN=0 LIST_ONLY=0 ALL=0 ANY=0
PORTS=()

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while (($#)); do
  case $1 in
    -f|--force)   FORCE=1 ;;
    -n|--dry-run) DRY_RUN=1 ;;
    -l|--list)    LIST_ONLY=1 ;;
    -a|--all)     ALL=1 ;;
    --any)        ANY=1 ;;
    -h|--help)    usage; exit 0 ;;
    -*)           echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)            PORTS+=("$1") ;;
  esac
  shift
done
((${#PORTS[@]})) || PORTS=("${DEFAULT_PORTS[@]}")

log()  { printf '%s\n' "$*"; }
note() { printf '  %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }

# --- self protection: never touch this script's own process tree ---
protected=()
p=$$
while [[ -n $p && $p -gt 1 ]]; do
  protected+=("$p")
  p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"
done
is_protected() {
  local x
  for x in "${protected[@]}"; do [[ $1 == "$x" ]] && return 0; done
  return 1
}

is_mine()    { [[ -d /proc/$1 && -O /proc/$1 ]]; }
in_container() { grep -qiE 'docker|containerd|kubepods|libpod|lxc' "/proc/$1/cgroup" 2>/dev/null; }
cmd_of()     { ps -o args= -p "$1" 2>/dev/null || true; }

# Listening PIDs on a TCP port (ss first, lsof as fallback).
pids_on_port() {
  local port=$1 out
  out="$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -un || true)"
  if [[ -z $out ]] && command -v lsof >/dev/null 2>&1; then
    out="$(lsof -t -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -un || true)"
  fi
  printf '%s\n' "$out"
}

# Walk up from a pid, echoing every dev-related ancestor (nearest first).
dev_ancestors() {
  local pid=$1 ppid cmd
  while [[ -n $pid && $pid -gt 1 ]]; do
    ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
    [[ -z $ppid || $ppid -le 1 ]] && break
    cmd="$(cmd_of "$ppid")"
    if [[ $cmd =~ $DEV_RE ]]; then
      printf '%s\n' "$ppid"
      pid=$ppid
    else
      break
    fi
  done
}

descendants() {
  local root=$1 cur kids out=()
  local queue=("$root")
  while ((${#queue[@]})); do
    cur="${queue[0]}"; queue=("${queue[@]:1}")
    kids="$(pgrep -P "$cur" 2>/dev/null || true)"
    for k in $kids; do out+=("$k"); queue+=("$k"); done
  done
  ((${#out[@]})) && printf '%s\n' "${out[@]}"
  return 0
}

depth_of() {
  local d=0 pid=$1
  while [[ -n $pid && $pid -gt 1 && $d -lt 64 ]]; do
    pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
    [[ -z $pid ]] && break
    d=$((d + 1))
  done
  printf '%s\n' "$d"
}

# --- gather ------------------------------------------------------- #
declare -A seen
targets=()
add() {
  local pid=$1
  [[ -z $pid || -n ${seen[$pid]+x} ]] && return 0
  seen[$pid]=1
  targets+=("$pid")
}

killable_chain() {  # echoes the topmost dev ancestor, or nothing
  local pid=$1 top=""
  while read -r a; do top=$a; done < <(dev_ancestors "$pid")
  printf '%s' "$top"
}

if ((LIST_ONLY)); then
  log "Listening on ${PORTS[*]}:"
  for port in "${PORTS[@]}"; do
    pids="$(pids_on_port "$port")"
    if [[ -z $pids ]]; then
      note ":$port  free"
      continue
    fi
    while read -r pid; do
      [[ -z $pid ]] && continue
      note ":$port  pid=$pid  user=$(ps -o user= -p "$pid" | tr -d ' ')  $(cmd_of "$pid")"
    done <<<"$pids"
  done
  exit 0
fi

for port in "${PORTS[@]}"; do
  pids="$(pids_on_port "$port")"
  if [[ -z $pids ]]; then
    note ":$port free"
    continue
  fi
  while read -r pid; do
    [[ -z $pid ]] && continue
    if is_protected "$pid"; then continue; fi
    if ! is_mine "$pid"; then
      warn ":$port pid=$pid is not yours ($(ps -o user= -p "$pid" 2>/dev/null | tr -d ' ')) - skipped (docker? use 'docker-compose down')"
      continue
    fi
    if in_container "$pid"; then
      warn ":$port pid=$pid runs in a container - skipped (use 'docker-compose down')"
      continue
    fi
    top="$(killable_chain "$pid")"
    if [[ -z $top && $ANY -eq 0 ]]; then
      if [[ "$(cmd_of "$pid")" =~ $DEV_RE ]]; then
        add "$pid"
        while read -r d; do add "$d"; done < <(descendants "$pid")
      else
        warn ":$port pid=$pid is not a dev server ($(cmd_of "$pid")) - skipped (use --any to kill it)"
      fi
      continue
    fi
    if [[ -n $top ]]; then
      add "$top"
      while read -r d; do add "$d"; done < <(descendants "$top")
    else
      add "$pid"
      while read -r d; do add "$d"; done < <(descendants "$pid")
    fi
  done <<<"$pids"
done

if ((ALL)); then
  while read -r pid; do
    [[ -z $pid ]] && continue
    [[ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)" == "$ROOT" ]] || continue
    is_mine "$pid" || continue
    add "$pid"
    while read -r d; do add "$d"; done < <(descendants "$pid")
  done < <(pgrep -f 'scripts/dev\.mjs' 2>/dev/null || true)
fi

if ((${#targets[@]} == 0)); then
  log "Nothing to kill - ${PORTS[*]} are free (or only held by processes this script refuses to touch)."
  exit 0
fi

# deepest first, so parents can shut down their own children gracefully
mapfile -t order < <(
  for pid in "${targets[@]}"; do printf '%s %s\n' "$(depth_of "$pid")" "$pid"; done \
    | sort -rn | awk '{print $2}'
)

log "Targets:"
for pid in "${order[@]}"; do
  note "pid=$pid  $(cmd_of "$pid")"
done

if ((DRY_RUN)); then
  log "(dry run - nothing killed)"
  exit 0
fi

sig=TERM
((FORCE)) && sig=KILL
log "Sending SIG$sig…"
for pid in "${order[@]}"; do
  is_protected "$pid" && continue
  kill "-$sig" "$pid" 2>/dev/null || true
done

# wait for them to go, then escalate
if [[ $sig == TERM ]]; then
  for _ in $(seq 1 50); do
    alive=0
    for pid in "${order[@]}"; do kill -0 "$pid" 2>/dev/null && alive=1; done
    ((alive)) || break
    sleep 0.1
  done
  for pid in "${order[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      warn "pid=$pid ignored SIGTERM - SIGKILL"
      is_protected "$pid" || kill -KILL "$pid" 2>/dev/null || true
    fi
  done
fi

log "Port status:"
leftover=0
for port in "${PORTS[@]}"; do
  pids="$(pids_on_port "$port" | tr '\n' ' ')"
  if [[ -z ${pids// /} ]]; then
    note ":$port free"
  else
    leftover=1
    warn ":$port still held by pid(s): $pids"
  fi
done
exit "$leftover"
