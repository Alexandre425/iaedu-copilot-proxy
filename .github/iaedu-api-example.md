# IAEdu API Example

This is an example provided directly by IAEdu of how to call their API.

```py
import os
import uuid
import json
import requests

# --- API Configuration ---
# NOTE: Replace these values with your actual IAEdu API credentials.
API_ENDPOINT = "API_ENDPOINT"
API_KEY = "API_KEY"
CHANNEL_ID = "CHANNEL_ID"

# NOTE: The Thread ID can be random. It's recommended to use a UUID to avoid conflicts.
THREAD_ID = str(uuid.uuid4())

def _build_headers():
    # Ensures the API key is included in the headers for authentication.
    return {
        "x-api-key": API_KEY,
    }


def _build_form_data(user_message: str):
    # Builds the form-data for the API request.
    return {
        "channel_id": (None, CHANNEL_ID),
        "thread_id": (None, THREAD_ID),
        "user_info": (None, json.dumps({})),
        "message": (None, user_message),
    }

# Streaming function that sends a message to the API and yields tokens as they are received.
def stream_message(user_message: str):
    """Sends a message to the API and yields tokens as they are received.

    Args:
        user_message: The user's message.

    Yields:
        Each text token as it is received from the API.

    Raises:
        requests.exceptions.RequestException: If the communication fails. Explains where the error occurs.
    """

    headers = _build_headers()
    form_data = _build_form_data(user_message)

    response = requests.post(
        API_ENDPOINT,
        headers=headers,
        files=form_data,
        stream=True,
    )
    response.raise_for_status()

    # Instead of waiting for the full response, we process it line by line as it streams in.
    for line in response.iter_lines():
        if line:
            # Transforms the line (text) into data.
            try:
                data = json.loads(line.decode("utf-8"))
                # If it's a token, yield the content.
                if data.get("type") == "token" and "content" in data:
                    yield data["content"]
            except json.JSONDecodeError:
                # If it's not valid JSON, ignore it.
                pass

# Simple chat loop to interact with the API.
def chat():
    while True:
        user_message = input("\nUser: ")

        if user_message.strip().lower() in ["exit", "quit"]:
            print("Ending conversation... thank you!")
            break

        if not user_message.strip():
            continue

        print("\n🤖 :", end=" ", flush=True)

        try:
            for token in stream_message(user_message):
                print(token, end="", flush=True)
            print()  # New line after the response is complete.
        except Exception as e:
            print(f"\n[ERROR] Failed to communicate with the API: {e}")

if __name__ == "__main__":
    chat()
```