#!/usr/bin/env bash
# Are the provider endpoints reachable right now?
#
# Uses curl, not node: these hosts TLS-fingerprint their callers and refuse
# node's fetch regardless of headers. Chrome passes, which is where the
# extension runs — so a failure here is about this machine, not the extension.
set -u
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
today=$(date +%Y%m%d)

probe() {
  local name=$1 url=$2
  local code size
  read -r code size < <(curl -s -m 20 -o /dev/null -w '%{http_code} %{size_download}' -H "User-Agent: $UA" "$url")
  printf '%-28s HTTP %s  %s bytes\n' "$name" "$code" "$size"
  [ "$code" = "200" ]
}

fail=0
probe "sofascore live"   "https://api.sofascore.com/api/v1/sport/football/events/live" || fail=1
probe "fotmob matches"   "https://www.fotmob.com/api/data/matches?date=$today" || fail=1
exit $fail
