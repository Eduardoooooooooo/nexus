# Nexus

Aplicativo local com interface web, API Node.js, banco SQLite e reprodução de mídia.

## Executar

Requisito: Node.js 24 ou superior. Na raiz do projeto, execute:

```sh
npm start
```

Abra http://localhost:3000. A porta pode ser definida por `PORT` no `.env`.

## Organização

- `server.js`: ponto de entrada e rotas dos arquivos da interface.
- `src/server/`: API, banco de dados, entrega de mídia e consulta de metadados.
- `src/pages/`: páginas HTML.
- `src/styles/`: estilos CSS.
- `src/main.js`: comportamento da interface.
- `src/assets/`: imagens, músicas e vídeos.
- `data/`: banco SQLite e arquivos auxiliares; mantenha a pasta completa.
- `docs/`: documentação de configuração e funcionamento.
- `.vscode/`: configurações do editor.
- `.env`: credenciais e configuração local; não publicar.

Os caminhos citados na documentação são relativos à raiz do projeto.

## Documentação

- [Banco de dados e acessos iniciais](docs/SQLITE.md)
- [Integrações e metadados das músicas](docs/MUSIC-API.md)
