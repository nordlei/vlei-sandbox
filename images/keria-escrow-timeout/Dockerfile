FROM weboftrust/keria:0.1.4-dev0

ENV KERI_DIR="/keripy/src/keri" 
# KERI_DIR="/keripy/venv/lib/python3.12/site-packages/keri" # For keria 0.2.0-devX

COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
