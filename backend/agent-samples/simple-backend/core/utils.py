"""
Utility functions for Agora ConvoAI
"""

import random
import string


def generate_random_channel(length=10):
    """
    Generates a random channel name with uppercase letters and numbers.

    Args:
        length: Length of the channel name (default: 10)

    Returns:
        Random channel name string
    """
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))


def json_response(status_code, body):
    """
    Creates a properly formatted JSON response for API Gateway.

    Args:
        status_code: HTTP status code
        body: Dictionary to be serialized to JSON

    Returns:
        Dictionary formatted for API Gateway response
    """
    import json
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps(body)
    }
