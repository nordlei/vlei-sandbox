#!/bin/bash

keri_dir=${KERI_DIR:-/keripy/src/keri} # For keria v0.1.4-dev0
# KERI_DIR="/keripy/venv/lib/python3.12/site-packages/keri" # For keria 0.2.0-devX

sed -i'' -E "s/Timeout([A-Z][A-Z][A-Z]) = [0-9]*/Timeout\1 = 10/g" "$keri_dir/core/eventing.py"
sed -i'' -E "s/Timeout([A-Z][A-Z][A-Z]) = [0-9]*/Timeout\1 = 10/g" "$keri_dir/vdr/verifying.py"
sed -i'' -E "s/Timeout([A-Z][A-Z][A-Z]) = [0-9]*/Timeout\1 = 10/g" "$keri_dir/vdr/eventing.py"

grep -E -r "^\s+Timeout([A-Z])+ = ([0-9])+" "$keri_dir"

keria start --config-file keria --name agent
