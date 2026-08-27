#!/bin/bash
cd /home/ubuntu/agent-samples/simple-backend
source venv/bin/activate
PORT=8082 exec python3 local_server.py
