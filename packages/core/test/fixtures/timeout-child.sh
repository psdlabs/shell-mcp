#!/bin/sh

mode=$1
printf '%s\n' "$$"

case "$mode" in
  idle)
    sleep 30
    ;;
  descendant)
    sleep 30 &
    printf '%s\n' "$!"
    wait
    ;;
  stdout)
    while :; do
      printf '%s\n' "stdout"
      sleep 0.01
    done
    ;;
  stderr)
    while :; do
      printf '%s\n' "stderr" >&2
      sleep 0.01
    done
    ;;
  *)
    printf 'Unknown fixture mode: %s\n' "$mode" >&2
    exit 1
    ;;
esac
