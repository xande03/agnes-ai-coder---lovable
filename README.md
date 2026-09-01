# Agnes AI Coder

utilizadndo o modelo "agnes-2.5-flash" , crie uma agente de ia que modifique projetos do github mediante a interação usuarios pelo chat. O usuario primeiramente informa em um painel, as credenciais de token e chave api para que o app se coencte com com o projeto para assim abrir o chat de interação entre o agente e usuario. O usuario solicita uma correçãom ajuste, modificação ou adicilççao de compoentes ou elementos ao projeto e o agente entra em ação vendo primeira mente a estrutura atual do projeto para ssim fazer as mudanças; O agente deve fazer de forma precisa as mudanças de forma que seja no local exatado onde o código sa solicitação doi enviado, po isso o agente não deve solicitar ou perguntar nada ao usuario e sim realizar as mudanças e FAZER O COMIT COM O PUSH automaticos para o github. 
A interface deve ser premium, intuitiva e dinamica, tendo alternancia entreo omodo claro escuro, identificação do projeto que foi conectado, botão de desconectar e outras funções 
- deve ter opção de anexar imagens e aruqivos com drag-drop, e opção de copitar ec olar no input do prompts
- deve ter botão de alternancia entre o tema claro e escuro
- deve ter responssividade para todosos dispositivos e desktop 
- deve ter botão para baixar repositorio e aba dos aruqivos do repositoeio para usuários possam visualizar o s aruqivos do repositorio 
_ deve ter um layout premum porém de fácil manipulação e e eficiente na entrega das repostas 
- garanta que o agnete "agens -2.5-flash" seja capaz de introduzir imagens e arquivos ao projeto e ajusta-los mediante a solicitação do usuário 

chave api: @secret:OPENAI_API_KEY 
url base: https://apihub.agnes-ai.com/v1

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c10a0295-e5df-462c-999a-059cf581e621).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
