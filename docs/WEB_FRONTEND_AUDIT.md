# Web Frontend Audit

## Frontend usado como referencia

Repositorio local encontrado:

```text
../frontend
```

Os caminhos pedidos `../riverlub-frontend` e `../riverlub-frontend-vercel` nao existem no workspace local desta maquina. O `../frontend` e um app Next.js com telas RiverLub atuais, classes `rl-*`, paginas de O.S., clientes, estoque, financeiro, pagamentos, WhatsApp e relatorios. Por isso ele foi usado como referencia visual nesta entrega.

Nenhum arquivo do frontend web foi alterado.

## Arquivos principais analisados

```text
../frontend/src/components/AppPageShell.js
../frontend/src/components/AppSidebar.js
../frontend/src/components/AppTopbar.js
../frontend/src/components/SidebarBrand.js
../frontend/src/lib/navigation.js
../frontend/src/app/globals.css
../frontend/src/app/desktop-redesign.css
../frontend/src/app/page.js
../frontend/src/app/clientes/page.js
../frontend/src/app/veiculos/page.js
../frontend/src/app/os/page.js
../frontend/src/app/orcamentos/page.js
../frontend/src/app/estoque/page.js
../frontend/src/app/financeiro/page.js
../frontend/src/app/whatsapp/page.js
```

## Estrutura de layout

O web usa uma estrutura principal:

```text
rl-app
  rl-sidebar
  rl-shell-content
    rl-main
      rl-main-stage
        rl-desktop-topbar
        rl-page-transition-layer
```

Padroes observados:

- sidebar fixa a esquerda;
- fundo geral claro `#eef2f6`/`#f4f7fb`;
- conteudo com topbar sticky;
- busca global no topo;
- card de usuario/data/alertas no topo;
- paginas com titulo grande, subtitulo curto e acoes no canto direito.

## Sidebar e header

Sidebar:

- largura aproximada de 256px;
- fundo azul/preto profundo com gradiente;
- item ativo azul intenso;
- labels de secao em uppercase pequeno;
- itens com icone, titulo e descricao curta;
- suporte/footer no rodape.

Header:

- busca global com placeholder "Buscar cliente, veiculo, placa, orcamento ou O.S...";
- card de data/hora;
- botao de notificacoes;
- card de usuario;
- visual branco com borda e sombra leve.

## Paginas principais

Paginas encontradas no web:

- Visao Geral/Dashboard: `src/app/page.js`;
- Clientes: `src/app/clientes/page.js`;
- Veiculos: `src/app/veiculos/page.js`;
- Ordens de Servico: `src/app/os/page.js` e `src/app/os/[id]/page.js`;
- Orcamentos: `src/app/orcamentos/page.js`;
- Estoque: `src/app/estoque/page.js`;
- Financeiro: `src/app/financeiro/page.js`;
- Pagamentos: `src/app/pagamentos/page.js`;
- Relatorios: `src/app/relatorios/page.js`;
- WhatsApp: `src/app/whatsapp/page.js`;
- Configuracoes: `src/app/configuracoes/page.js`.

## Cards

Padroes:

- `.rl-card` com fundo branco, borda `#d8e0ea`, borda arredondada grande e sombra leve;
- `.rl-kpi` com faixa superior azul/roxa e valor grande;
- `.rl-card-title` forte;
- `.rl-card-subtitle` cinza suave;
- layouts em grid responsivo.

No Desktop, isso foi adaptado para:

- `rl-web-card`;
- `rl-web-metrics`;
- `rl-web-page-head`;
- `rl-web-empty`.

## Tabelas

Padroes:

- `.rl-table-wrapper` branco, borda e raio grande;
- cabecalho com uppercase, fonte pequena e fundo `#f8fbff`;
- linhas com padding, borda inferior e hover leve;
- acoes em pills/botoes pequenos.

No Desktop, isso foi adaptado para:

- `rl-web-table-card`;
- `rl-web-table-head`;
- `rl-web-table-row`;
- `rl-web-table-action`.

## Botoes

Padroes:

- `.rl-btn`;
- `.rl-btn-primary` azul;
- `.rl-btn-secondary` branco/cinza com borda;
- `.rl-btn-success`, `.rl-btn-danger` para acoes especificas;
- altura em torno de 44px;
- borda arredondada entre 12px e 16px no redesign desktop.

No Desktop, isso foi adaptado para:

- `rl-web-btn primary`;
- `rl-web-btn secondary`;
- botoes de filtro e tabela.

## Cores

Principais cores observadas:

```text
Fundo: #eef2f6 / #f4f7fb
Sidebar: #0a1325 / #09111f
Texto: #16202b
Texto suave: #5f6b7a
Borda: #d8e0ea
Azul principal: #2f6bff / #2458e0
Sucesso: #198754
Alerta: #f59e0b
Perigo: #dc3545
```

Essas cores foram copiadas para `src/desktop/styles/tokens.css`.

## Espacamentos

Padroes:

- shell principal com padding aproximado de `22px 26px 34px`;
- cards com padding entre 18px e 24px;
- gaps de 14px, 18px e 24px;
- raios grandes no web atual, especialmente 16px, 18px e 24px.

## Riscos de adaptar Next.js para Vite/Tauri

- Componentes web usam `next/link`, `next/navigation`, `Image`, rotas App Router e hooks de auth do web.
- Nao e seguro copiar componentes inteiros para o Tauri sem remover dependencias Next.
- O Desktop precisa consumir API segura, nao importar regras diretamente do Next.
- CSS global do web e grande e tem muitas regras por pagina; importar tudo criaria efeitos colaterais no Connect.
- A solucao segura nesta etapa foi portar tokens e padroes visuais, nao o app web inteiro.

## Decisao desta entrega

O RiverLub Desktop agora usa uma casca visual propria inspirada no web:

- `src/desktop/DesktopShell.jsx`;
- `src/desktop/DesktopSidebar.jsx`;
- `src/desktop/DesktopHeader.jsx`;
- `src/desktop/desktopNavigation.js`;
- `src/desktop/styles/tokens.css`;
- `src/desktop/styles/layout.css`;
- `src/desktop/styles/components.css`.

O Connect/WhatsApp nao e mais a experiencia principal. Ele fica em:

```text
WhatsApp > Agente / Connect
```

O web segue preservado e nao foi alterado.
