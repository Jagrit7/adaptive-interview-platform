"""
Agora v007 token generation with RTC and RTM services
"""

import hmac
from hashlib import sha256
import base64
import struct
import zlib
import secrets
import time
from collections import OrderedDict


def get_version():
    """Returns the token version string."""
    return '007'


def pack_uint16(x):
    return struct.pack('<H', int(x))


def pack_uint32(x):
    return struct.pack('<I', int(x))


def pack_string(string):
    if isinstance(string, str):
        string = string.encode('utf-8')
    return pack_uint16(len(string)) + string


def pack_map_uint32(m):
    return pack_uint16(len(m)) + b''.join([pack_uint16(k) + pack_uint32(v) for k, v in m.items()])


class Service:
    """Base class for token services."""

    def __init__(self, service_type):
        self.__type = service_type
        self.__privileges = {}

    def __pack_type(self):
        return pack_uint16(self.__type)

    def __pack_privileges(self):
        privileges = OrderedDict(
            sorted(iter(self.__privileges.items()), key=lambda x: int(x[0])))
        return pack_map_uint32(privileges)

    def add_privilege(self, privilege, expire):
        self.__privileges[privilege] = expire

    def service_type(self):
        return self.__type

    def pack(self):
        return self.__pack_type() + self.__pack_privileges()


class ServiceRtc(Service):
    """RTC service for token generation."""

    kServiceType = 1
    kPrivilegeJoinChannel = 1
    kPrivilegePublishAudioStream = 2
    kPrivilegePublishVideoStream = 3
    kPrivilegePublishDataStream = 4

    def __init__(self, channel_name='', uid=0):
        super(ServiceRtc, self).__init__(ServiceRtc.kServiceType)
        self.__channel_name = channel_name.encode('utf-8')
        self.__uid = b'' if uid == 0 else str(uid).encode('utf-8')

    def pack(self):
        return super(ServiceRtc, self).pack() + pack_string(self.__channel_name) + pack_string(self.__uid)


class ServiceRtm(Service):
    """RTM service for token generation."""

    kServiceType = 2
    kPrivilegeLogin = 1

    def __init__(self, user_id=''):
        super(ServiceRtm, self).__init__(ServiceRtm.kServiceType)
        self.__user_id = user_id.encode('utf-8')

    def pack(self):
        return super(ServiceRtm, self).pack() + pack_string(self.__user_id)


class AccessToken:
    """
    Access token generator using v007 service-based architecture.
    """

    def __init__(self, app_id='', app_certificate='', issue_ts=0, expire=900):
        self.__app_id = app_id
        self.__app_cert = app_certificate
        self.__issue_ts = issue_ts if issue_ts != 0 else int(time.time())
        self.__expire = expire
        self.__salt = secrets.SystemRandom().randint(1, 99999999)
        self.__service = {}

    def __signing(self):
        signing = hmac.new(pack_uint32(self.__issue_ts), self.__app_cert, sha256).digest()
        signing = hmac.new(pack_uint32(self.__salt), signing, sha256).digest()
        return signing

    def __build_check(self):
        def is_uuid(data):
            if len(data) != 32:
                return False
            try:
                bytes.fromhex(data)
            except:
                return False
            return True

        if not is_uuid(self.__app_id) or not is_uuid(self.__app_cert):
            return False
        if not self.__service:
            return False
        return True

    def add_service(self, service):
        self.__service[service.service_type()] = service

    def build(self):
        if not self.__build_check():
            return ''

        self.__app_id = self.__app_id.encode('utf-8')
        self.__app_cert = self.__app_cert.encode('utf-8')
        signing = self.__signing()
        signing_info = pack_string(self.__app_id) + pack_uint32(self.__issue_ts) + pack_uint32(self.__expire) + \
                       pack_uint32(self.__salt) + pack_uint16(len(self.__service))

        for _, service in self.__service.items():
            signing_info += service.pack()

        signature = hmac.new(signing, signing_info, sha256).digest()

        return get_version() + base64.b64encode(zlib.compress(pack_string(signature) + signing_info)).decode('utf-8')


def build_token_with_rtm(channel_name, account, constants, rtm_uid=None):
    """
    Builds a token with both RTC and RTM privileges using v007 token system.

    Args:
        channel_name: The channel name
        account: The user's account/UID (used for RTC service)
        constants: Dictionary of constants
        rtm_uid: Optional separate UID for RTM service (defaults to account)

    Returns:
        Dictionary containing token and uid
    """
    # Return APP_ID as token if APP_CERTIFICATE is empty
    if not constants["APP_CERTIFICATE"]:
        return {"token": constants["APP_ID"], "uid": account}

    token = AccessToken(constants["APP_ID"], constants["APP_CERTIFICATE"])

    # RTC Service — uses account (e.g. "100" for agent, "101" for user)
    rtc_service = ServiceRtc(channel_name, account)
    rtc_service.add_privilege(ServiceRtc.kPrivilegeJoinChannel, constants["PRIVILEGE_EXPIRE"])
    rtc_service.add_privilege(ServiceRtc.kPrivilegePublishAudioStream, constants["PRIVILEGE_EXPIRE"])
    rtc_service.add_privilege(ServiceRtc.kPrivilegePublishVideoStream, constants["PRIVILEGE_EXPIRE"])
    rtc_service.add_privilege(ServiceRtc.kPrivilegePublishDataStream, constants["PRIVILEGE_EXPIRE"])
    token.add_service(rtc_service)

    # RTM Service — uses rtm_uid if provided (e.g. a dedicated service identity)
    rtm_service = ServiceRtm(rtm_uid if rtm_uid else account)
    rtm_service.add_privilege(ServiceRtm.kPrivilegeLogin, constants["TOKEN_EXPIRE"])
    token.add_service(rtm_service)

    return {"token": token.build(), "uid": account}
