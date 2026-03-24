# Element-Viewer — Web App

> **URL de Deploy:** [https://element-viewer.vercel.app/](https://element-viewer.vercel.app/)  
> **Diretório:** `Element-Viewer/`

---

## Objetivo

O Element-Viewer é um **simulador interativo de matéria** que permite visualizar o comportamento físico de elementos químicos em tempo real. O app simula transições de fase, dinâmica de partículas, e propriedades termodinâmicas com base em dados científicos reais para todos os 118 elementos da tabela periódica.

---

## Estrutura de Arquivos

```
Element-Viewer/
├── index.html                  # Ponto de entrada HTML
├── index.tsx                   # Bootstrap React (ReactDOM.createRoot)
├── App.tsx                     # Componente raiz — orquestra toda a aplicação
├── types.ts                    # Definições de tipos TypeScript
├── vite.config.ts              # Configuração do Vite (single-file build)
├── vercel.json                 # Headers CSP + rewrites para deploy
├── package.json                # Dependências e scripts
│
├── components/
│   └── Simulator/
│       ├── SimulationUnit.tsx       # Unidade isolada de simulação por elemento
│       ├── MatterVisualizer.tsx     # Renderização SVG da matéria e partículas
│       ├── ControlPanel.tsx         # Controles de temperatura e pressão
│       ├── PeriodicTableSelector.tsx # Seletor de elementos (tabela periódica)
│       ├── ElementPropertiesMenu.tsx # Menu contexto com propriedades do elemento
│       └── RecordingStatsModal.tsx   # Modal de resultados de gravação
│
├── hooks/
│   ├── usePhysics.ts           # Hook principal — game loop de física
│   ├── useChatGPT.ts           # Hook de integração com ChatGPT Apps SDK (Window.openai)
│   └── physics/
│       ├── thermodynamics.ts   # Motor termodinâmico (enthalpy, fases, Clausius-Clapeyron)
│       ├── geometry.ts         # Cálculos geométricos (compressão, bounds)
│       ├── particleSystem.ts   # Sistema de partículas (Brownian motion)
│       └── types.ts            # Tipos internos do estado mutável
│
├── utils/
│   ├── interpolator.ts         # Interpolação de SVG paths, cores e valores
│   ├── physicsUtils.ts         # Utilitários (ex: símbolo molecular)
│   └── units.ts                # Conversão de unidades (K/°C/°F, Pa/atm/bar/etc)
│
├── data/
│   ├── elements.ts             # Array dos 118 elementos com propriedades físicas
│   ├── elements-visuals.ts     # DNA visual (cores por estado de matéria)
│   ├── scientific_data.ts      # Dados científicos complementares
│   └── periodic_table_source.ts # Dados brutos da tabela periódica
│
└── *.py                        # Scripts Python auxiliares para geração de dados
```

---

## Arquitetura de Componentes

### `App.tsx` — Componente Raiz

Orquestra toda a aplicação. Responsabilidades:

| Função | Descrição |
|---|---|
| **Seleção de elementos** | Single-select ou multi-select (até 6 elementos) com lógica FIFO |
| **Estado global do ambiente** | Temperatura (K) e pressão (Pa) compartilhados entre simulações |
| **Controles flutuantes** | Pause/Play, velocidade (0.25x → 4x), gravação |
| **Layout em grade** | Grid responsivo que se adapta ao nº de elementos selecionados |
| **Gravação** | Captura snapshot inicial/final do estado físico para comparação |
| **Menu de contexto** | Clique para inspecionar propriedades detalhadas de um elemento |

**Layout por quantidade de elementos:**
- 1 elemento → tela cheia
- 2 elementos → 2 colunas
- 3–4 elementos → grade 2×2
- 5–6 elementos → grade 2×3 (ou 3×2 em telas maiores)

---

### `SimulationUnit.tsx` — Unidade de Simulação

Cada elemento selecionado roda sua **própria instância isolada** de física. Este componente:

1. Calcula o **ViewBox** SVG dinâmico baseado no layout
2. Instancia o hook `usePhysics` com o elemento e condições globais
3. Registra um **getter de snapshot** para o sistema de gravação
4. Renderiza o `MatterVisualizer` com o estado físico calculado

---

### `MatterVisualizer.tsx` — Renderização Visual

Componente SVG que renderiza a visualização completa do elemento. Inclui:

- **Forma da matéria** — SVG path interpolado entre keyframes (sólido → líquido → gás)
- **Sistema de partículas** — Círculos SVG animados com comportamento por estado
- **Gradientes e efeitos** — Cores interpoladas entre estados, sombras, brilho
- **Nebulosa supercrítica** — Efeito visual especial para fluidos supercríticos
- **HUD** — Exibe símbolo, nome, temperatura, estado de matéria, e símbolo molecular
- **Interação** — Clique para inspecionar propriedades

---

### `ControlPanel.tsx` — Painel de Controle

Sidebar com controles interativos:

- **Slider de Temperatura** — Range 0K a 40000K, com conversão entre K, °C, °F, °Ra
- **Slider de Pressão** — Escala logarítmica (10⁻² a 10¹² Pa), conversão entre Pa, kPa, atm, bar, psi, mmHg, etc
- **Toggle de Partículas** — Mostra/esconde sistema de partículas
- **Marcadores** — Indicadores visuais de ponto de fusão e ebulição no slider

---

### `PeriodicTableSelector.tsx` — Seletor de Elementos

Tabela periódica compacta para seleção interativa de elementos. Suporta:
- **Single-select** — Um elemento por vez
- **Multi-select** — Até 6 elementos simultâneos (toggle FIFO)

---

### `ElementPropertiesMenu.tsx` — Menu de Propriedades

Menu popup que aparece ao clicar em um elemento na simulação. Exibe propriedades detalhadas:
- Ponto de fusão/ebulição, densidade, raio atômico
- Eletronegatividade, afinidade eletrônica, energia de ionização
- Estados de oxidação, condutividade térmica/elétrica
- Ponto triplo, ponto crítico
- Citação de fontes de dados

---

### `RecordingStatsModal.tsx` — Resultados de Gravação

Modal que apresenta comparação entre estados inicial e final de uma gravação por elemento, incluindo deltas de temperatura, pressão, e transições de fase.

---

## Motor de Física

### `usePhysics.ts` — Game Loop Principal

Hook React que executa um loop de animação (`requestAnimationFrame`) com 3 etapas por frame:

```
1. Termodinâmica   → Calcula temperatura, enthalpy, estado de matéria
2. Geometria       → Calcula forma, compressão, limites visuais
3. Partículas      → Atualiza posição/velocidade de cada partícula
```

**Parâmetros:**
- `element` — Elemento químico com todas as propriedades
- `temperature` — Temperatura-alvo do ambiente (K)
- `pressure` — Pressão do ambiente (Pa)
- `timeScale` — Multiplicador de velocidade (0.25x a 4x)
- `isPaused` — Pausa completa do loop

**Constantes:**
- `SAMPLE_MASS = 0.001 kg` (1 grama)
- `BASE_PARTICLE_COUNT = 50`

---

### `thermodynamics.ts` — Motor Termodinâmico

Coração da simulação física. Implementa:

| Modelo | Descrição |
|---|---|
| **Clausius-Clapeyron** | Calcula ponto de ebulição dinâmico em função da pressão |
| **Simon-Glatzel** | Calcula ponto de fusão dinâmico em função da pressão |
| **Enthalpy System** | Sistema de energia baseado em calor específico e calor latente |
| **Sublimação** | Transição direta sólido → gás abaixo do ponto triplo |
| **Fluido Supercrítico** | Transição para estado supercrítico acima de T_c e P_c |

**Estados de Matéria Suportados** (`MatterState`):
- `SOLID`, `MELTING`, `EQUILIBRIUM_MELT`
- `LIQUID`, `BOILING`, `EQUILIBRIUM_BOIL`
- `GAS`, `SUBLIMATION`, `EQUILIBRIUM_SUB`
- `EQUILIBRIUM_TRIPLE`, `TRANSITION_SCF`, `SUPERCRITICAL`

---

### `geometry.ts` — Cálculos Geométricos

Calcula a geometria visual baseada no estado físico:
- **Retângulo da matéria** (`matterRect`) — Dimensões sólido/líquido
- **Limites do gás** (`gasBounds`) — Área de expansão de partículas
- **Fator de compressão** — Efeito da pressão no volume
- **Opacidade SCF** — Nível visual do nebulosa supercrítica

---

### `particleSystem.ts` — Sistema de Partículas

Simula ~50 partículas com comportamento por estado:

| Estado | Comportamento |
|---|---|
| `TRAPPED` | Partículas presas na estrutura (sólido/líquido) |
| `RISING` | Evaporando (transição líquido → gás) |
| `GAS` | Movimento Browniano livre com colisões elásticas |
| `CONDENSING` | Retornando ao líquido |

---

## Sistema de Tipos (`types.ts`)

### Tipos Principais

| Tipo | Descrição |
|---|---|
| `ChemicalElement` | Elemento completo: número atômico, símbolo, massa, propriedades, visual, comportamento |
| `ElementProperties` | Propriedades físicas: pontos de fusão/ebulição, calores específicos, calor latente, condutividades, ponto triplo/crítico, parâmetros Simon-Glatzel |
| `PhysicsState` | Estado completo da simulação: temperatura, pressão, enthalpy, partículas, geometria, progresso de transições |
| `VisualDNA` | Cores e opacidades por estado de matéria (sólido, líquido, gás) |
| `Particle` | Partícula individual: posição, velocidade, raio, estado |
| `MatterState` | Enum com 12 estados de matéria possíveis |

---

## Utilitários (`utils/`)

| Módulo | Funções |
|---|---|
| `units.ts` | `toKelvin`, `fromKelvin`, `toPascal`, `fromPascal` — 4 unidades de temperatura + 10 de pressão |
| `interpolator.ts` | `interpolatePath`, `interpolateKeyframes`, `interpolateColor`, `interpolateValue` — Interpolação de SVG, cores hex, e valores numéricos |
| `physicsUtils.ts` | `getMolecularSymbol` — Retorna símbolo molecular baseado na temperatura (ex: S₈ → S₂ → S) |

---

## Dados Científicos (`data/`)

| Arquivo | Conteúdo |
|---|---|
| `elements.ts` | Array `ELEMENTS` com os 118 elementos e suas propriedades físicas compiladas |
| `elements-visuals.ts` | Mapa de VisualDNA: cores específicas por elemento e estado |
| `scientific_data.ts` | Dados complementares de fontes científicas |
| `periodic_table_source.ts` | Dados brutos da tabela periódica (285KB) |

**Fontes de dados citadas:** Wikipedia (1), Mendeleev (2), PubChem (3), Angstrom (4), Wolfram (5)

---

## Integração ChatGPT SDK

O app foi projetado para rodar nativamente dentro do ChatGPT via **OpenAI Apps SDK**.

### `useChatGPT.ts` — Hook de Integração

Localizado em `hooks/useChatGPT.ts`, este hook encapsula toda a comunicação com `window.openai`.

**Funcionalidades:**
- **Sincronização de Estado**: Mantém `displayMode` (inline/fullscreen), `theme` (light/dark), e `safeArea` em sincronia com o ChatGPT.
- **Full Screen**: Exposição do método `requestDisplayMode('fullscreen')` para expandir o widget.
- **Type Safety**: Utiliza definições de tipos (`types.ts`) alinhadas com o SDK oficial (`OpenAiGlobals`, `API`).
- **Tooling (Futuro)**: Preparado para receber `toolInput` (conhecimento do chat) e enviar `callTool` (ações para o chat).

### Adaptações no `App.tsx`
- **Botão Fullscreen**: Utiliza `requestDisplayMode` para alternar entre linha e tela cheia.
- **Botão Picture-in-Picture (PiP)**: Novo botão para modo flutuante (`requestDisplayMode('pip')`).
- **Safe Areas**: Respeita as margens (`insets`) fornecidas pelo SDK para evitar sobreposição com a UI do ChatGPT.
- **Logging**: Monitora `toolInput` no console para debug de integrações futuras.

---

## Build e Deploy

```bash
# Desenvolvimento local
npm run dev          # Vite dev server em localhost:3000

# Build de produção
npm run build        # Gera bundle single-file em dist/

# Preview do build
npm run preview
```

### Configuração Vite (`vite.config.ts`)

- **Plugin `viteSingleFile`** — Gera um único arquivo HTML com todos os assets inline
- **`assetsInlineLimit: 100000000`** — Força inline de todos os assets
- **Server** — Porta 3000, host 0.0.0.0

### Deploy na Vercel (`vercel.json`)

- **CSP Headers** — `frame-ancestors * https://chatgpt.com https://chat.openai.com` (permite iframe no ChatGPT)
- **CORS** — `Access-Control-Allow-Origin: *`
- **Rewrites** — Todas as rotas servem `index.html` (SPA)
