import os
import uuid
import json
import requests


# --- Configuração da API ---
# NOTA: Todos os valores abaixo devem ser obtidos junto do IAedu.
API_ENDPOINT = "API_ENDPOINT"
API_KEY = "API_KEY"
CHANNEL_ID = "CHANNEL_ID"

# NOTA: O Thread ID poderá ser aleatório. Sugerido usar um UUID para evitar conflitos.
THREAD_ID = str(uuid.uuid4())

def _build_headers():
    # Garante que a API Key está no header
    return {
        "x-api-key": API_KEY,
    }


def _build_form_data(user_message: str):
    # Constrói o form-data para o pedido à API.
    return {
        "channel_id": (None, CHANNEL_ID),
        "thread_id": (None, THREAD_ID),
        "user_info": (None, json.dumps({})),
        "message": (None, user_message), # Utilizei uma variável para o input do utilizador.
    }

# Função para o streaming
def stream_message(user_message: str):
    """Envia uma mensagem à API e devolve os tokens em streaming.

    Args:
        user_message: A mensagem do utilizador.

    Yields:
        Cada token de texto à medida que é recebido da API.

    Raises:
        requests.exceptions.RequestException: Se a comunicação falhar. Explica onde é que o erro acontece.
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

    # 1 Em vez de ler tudo de uma, lê linha a linha.
    for line in response.iter_lines():
        if line:
            # 2 Transforma a linha (texto) em dados.
            try:
                data = json.loads(line.decode("utf-8"))
                # 3 Se for um token, devolve o conteúdo.
                if data.get("type") == "token" and "content" in data:
                    yield data["content"]
            except json.JSONDecodeError:
                # 4 Se não for JSON, ignora.
                pass


def chat():
    print("=====================================================")
    print("Bem-vindo! Obrigado por utilizar o serviço IAedu!")
    print("Escreve a tua mensagem abaixo. Digita 'sair', 'exit' ou 'quit' para terminar.")
    print("=====================================================\n")

    while True:
        user_message = input("\nUtilizador: ")

        if user_message.strip().lower() in ["sair", "exit", "quit"]:
            print("A terminar a conversa... obrigado!")
            break

        if not user_message.strip():
            continue

        print("\n🤖 :", end=" ", flush=True)

        try:
            for token in stream_message(user_message):
                print(token, end="", flush=True)
            print()  # Nova linha no final da resposta
        except Exception as e:
            print(f"\n[ERRO] Falha de comunicação com a API: {e}")

if __name__ == "__main__":
    chat()