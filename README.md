# Agência Premius Viagens

Painel de operações para excursões, leads e atendimento pelo WhatsApp.

## Rodar localmente

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

## Coolify

Crie um recurso do tipo **Dockerfile** apontando para este repositório e exponha a porta `3000`. Configure as variáveis de ambiente a partir de `.env.example`. Para manter os dados e a sessão do WhatsApp entre deploys, monte um volume persistente em `/app/data`.

`BAILEYS_ENABLED=false` deixa o modo demonstração ativo. Para conectar um número real, defina `BAILEYS_ENABLED=true`, monte o volume `/app/data` e abra a tela WhatsApp para ler o QR Code.

O Jev é ativado com `TYPESAFE_API_KEY`. Sem a chave, o sistema mantém uma classificação local de fallback para a demonstração.

O painel possui login por sessão. Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` no ambiente do Coolify antes do primeiro acesso; nunca publique a senha no repositório.
