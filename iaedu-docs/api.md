Uma **API (Application Programming Interface)** é um conjunto de regras que permite que diferentes aplicações comuniquem entre si.

De forma simples:

- A aplicação faz um pedido
- A API recebe o pedido
- A API responde com dados

Exemplo:  
Uma app de meteorologia não mede o clima, ela usa uma API que fornece esses dados.

#### Para que serve a API do IAedu?

A API do IAedu permite:

- Enviar mensagens para um modelo de inteligência artificial
- Receber respostas automaticamente
- Integrar IA em aplicações próprias (web, apps, scripts, etc.)

Na prática:  
Podes transformar as tuas aplicações em aplicações inteligentes com o IAedu  

#### Como funciona a comunicação com a API

O processo segue estes passos:

1. O utilizador escreve uma mensagem
2. A aplicação envia essa mensagem para a API
3. A API processa o pedido
4. O modelo gera uma resposta
5. A resposta é devolvida à aplicação

---

#### Credenciais necessárias

Para usar a API do IAedu precisas de:

##### API Key

- Funciona como uma chave de autenticação
- Identifica quem está a fazer o pedido

A API key estará exposta dentro da secção "Informação da API" na roda dentada de alguns modelos que são passíveis de ser utilizados via API.

[![{B9D8296B-3E24-4AE1-9C36-41C153AFAD96}.png](https://docs.iaedu.pt/uploads/images/gallery/2026-05/scaled-1680-/b9d8296b-3e24-4ae1-9c36-41c153afad96.png)](https://docs.iaedu.pt/uploads/images/gallery/2026-05/b9d8296b-3e24-4ae1-9c36-41c153afad96.png)

Regra importante:

Nunca partilhar a API\_key, é como uma password, não envies a ninguém.

---

#### Endpoint

- Identifica qual modelo vai responder

Vai à secção:

[![{B9D8296B-3E24-4AE1-9C36-41C153AFAD96}.png](https://docs.iaedu.pt/uploads/images/gallery/2026-05/scaled-1680-/b9d8296b-3e24-4ae1-9c36-41c153afad96.png)](https://docs.iaedu.pt/uploads/images/gallery/2026-05/b9d8296b-3e24-4ae1-9c36-41c153afad96.png)

Depois:

1. Selecione o modelo que disponibiliza o acesso da via API.
2. Procura:
	- Endpoint da API

---

#### Channel ID

- Define o canal de comunicação

Vai as settings dentro do modelo e procura

[![{B9D8296B-3E24-4AE1-9C36-41C153AFAD96}.png](https://docs.iaedu.pt/uploads/images/gallery/2026-05/scaled-1680-/b9d8296b-3e24-4ae1-9c36-41c153afad96.png)](https://docs.iaedu.pt/uploads/images/gallery/2026-05/b9d8296b-3e24-4ae1-9c36-41c153afad96.png)

Depois:

- abre as settings
- copia o ID

---

#### Thread ID

Este normalmente **não vem do painel, tens que criar o teu própio,** podes usar qualquer string única como "Titulo" ou "Tema" da conversa:

- `"conversa1"`
- `"user123"`
- `"teste"`

[![image.png](https://docs.iaedu.pt/uploads/images/gallery/2026-05/scaled-1680-/image.png)](https://docs.iaedu.pt/uploads/images/gallery/2026-05/image.png)
