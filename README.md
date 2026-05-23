# EAV — Estudo Gamificado

Plataforma gamificada de estudos com backend real em Node.js + SQLite e frontend moderno responsivo.

## Stack

- **Backend:** Node.js, Express, better-sqlite3
- **Frontend:** HTML, CSS, JavaScript (ES Modules)
- **Banco:** SQLite (dados reais, não localStorage)

## Funcionalidades

- Cronômetro Pomodoro / Foco / Livre com ganho de XP e moedas
- Sistema de level up, streak e multiplicadores
- Ranking semanal, geral, moedas e streak
- Loja com itens, raridades e sistema de compra
- Apostas entre amigos simuladas
- Missões diárias e semanais com recompensas
- Guildas com metas coletivas e progresso
- Conquistas com badges de raridade
- Cassino virtual (caça-níquel, roleta, cara ou coroa, dado, wheel, jackpot, all-in)
- Eventos temporários com boosts globais
- Painel Admin completo (configurações, usuários, loja, missões, eventos)
- Perfil com avatar, títulos, histórico e estatísticas

## Como rodar localmente

```bash
cd /home/caio/Documentos/EAV-ESTUDOS/EAV
npm install
npm start
```

Abra `http://localhost:3000`

## Como publicar no GitHub Pages

O projeto atual **requer backend** e não funciona apenas com GitHub Pages.

### Opção 1: Deploy completo (Railway / Render / Fly.io)

```bash
# Faça deploy do server.js em qualquer PaaS que suporte Node.js
# Defina a variável PORT se necessário
```

### Opção 2: Apenas frontend estático (sem backend)

O frontend puro (HTML+CSS+JS) pode ser publicado no GitHub Pages:
1. Copie os arquivos de `public/` para a raiz de um repositório
2. Vá em Settings > Pages e selecione o branch main

Neste caso, o site usará dados mockados se o backend não estiver disponível.

## Estrutura

```
EAV/
├── public/
│   ├── index.html    # Frontend (single page app)
│   ├── style.css     # Design system profissional
│   └── script.js     # Lógica do frontend com API calls
├── server.js         # Servidor Express + SQLite
├── package.json      # Dependências
├── eav.db            # Banco de dados (gerado automaticamente)
└── README.md
```

## Admin

Senha padrão: `admin123`

O painel admin permite:
- Configurar XP, moedas e multiplicadores
- Gerenciar loja, missões e eventos
- Dar moedas/XP manualmente
- Banir usuários
- Resetar temporada
