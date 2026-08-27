import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "agora-token-tools", "DynamicKey", "AgoraDynamicKey", "python", "src"))

from RtcTokenBuilder2 import RtcTokenBuilder, Role_Publisher
import time

import os
from dotenv import load_dotenv

load_dotenv()

APP_ID = os.environ["AGORA_APP_ID"]
APP_CERTIFICATE = os.environ["AGORA_APP_CERTIFICATE"]


def generate_token(channel_name: str, uid: int, role: int = Role_Publisher, expire_seconds: int = 3600) -> str:
    return RtcTokenBuilder.build_token_with_rtm(
        APP_ID, APP_CERTIFICATE, channel_name, str(uid), role, expire_seconds, expire_seconds
    )


if __name__ == "__main__":
    channel = sys.argv[1] if len(sys.argv) > 1 else "test-channel-1"
    uid = int(sys.argv[2]) if len(sys.argv) > 2 else 1002
    print(generate_token(channel, uid))