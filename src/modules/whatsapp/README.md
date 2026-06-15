# Modulo WhatsApp

O modulo WhatsApp atual continua preservado em `src/App.jsx` nesta fase inicial.

Ele usa o agente local em `127.0.0.1:47851`, os comandos Tauri existentes e o
cliente compartilhado `src/lib/localAgentClient.js`. A extracao completa para
um componente isolado fica para a proxima etapa, depois que a navegacao Desktop
estiver validada sem quebrar o Connect atual.
