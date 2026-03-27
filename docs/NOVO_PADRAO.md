# Novo Padrao de Templates (Core)

Este guia documenta o padrao recomendado para templates no Nexular core.

## Objetivo

Padronizar o uso de:

- Fluxo de controle moderno (`@if`, `@for`, `@switch`)
- Bindings no formato property-style (`[class]`, `[style.color]`, `[attr.aria-label]`)
- Pipes no formato `{{ valor | pipe }}`

## Controle de Fluxo

### `@if`, `@else if`, `@else`

```html
@if (user.authenticated) {
<p>Bem-vindo, {{ user.name }}</p>
} @else if (user.loading) {
<p>Carregando...</p>
} @else {
<p>Faça login</p>
}
```

### `@for`

```html
<ul>
  @for (item of items; track item.id) {
  <li>{{ item.name }}</li>
  }
</ul>
```

Notas:

- `track` e opcional, mas recomendado para listas grandes.
- O escopo do item e isolado por iteracao.

### `@switch`, `@case`, `@default`

```html
@switch (status) { @case ('idle') {
<p>Parado</p>
} @case ('running') {
<p>Executando</p>
} @default {
<p>Desconhecido</p>
} }
```

## Bindings Modernos

### Classe

```html
<div [class]="dynamicClassMap"></div>
<div [class.active]="isActive"></div>
```

### Estilo

```html
<div [style.color]="theme.textColor"></div>
<div [style]="{ color: theme.textColor, backgroundColor: theme.bg }"></div>
```

### Atributo

```html
<button [attr.aria-label]="label"></button>
<div [attr]="{ 'data-id': item.id, role: 'row' }"></div>
```

## Pipes

### Built-ins

Pipes built-in disponiveis:

- `uppercase`
- `lowercase`
- `titlecase`
- `json`
- `slice`
- `number`
- `percent`
- `currency`
- `date`

Exemplos:

```html
<p>{{ name | uppercase }}</p>
<p>{{ amount | currency:'USD' }}</p>
<p>{{ score | percent:2 }}</p>
<p>{{ createdAt | date:'pt-BR' }}</p>
```

### Registrar pipe customizado

```ts
import { registerTemplatePipe } from "../src/app/core/renderer";

registerTemplatePipe("slug", (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
);
```

### Biblioteca de pipes no core

APIs disponiveis no renderer:

- `listTemplatePipes()` lista pipes registradas.
- `registerTemplatePipe(name, transform)` registra pipe customizada.
- `unregisterTemplatePipe(name)` remove pipe registrada.

Exemplo de introspecao:

```ts
import { listTemplatePipes } from "../src/app/core/renderer";

const builtins = listTemplatePipes();
console.log(builtins);
```

### Recomendacoes de composicao

- Prefira pipes pequenas e puras (sem side effects).
- Encadeie pipes para transformacoes de apresentacao, nao de regra de negocio.
- Evite pipe customizada para logica de autorizacao, validacao ou IO.
- Ao criar pipe customizada, documente contrato de entrada e saida.

Exemplo de composicao:

```html
<p>{{ price | number:'pt-BR':2 | uppercase }}</p>
```

## Diagnostico de Template

APIs de diagnostico:

- `analyzeTemplateDiagnostics(template)` retorna problemas de binding e pipe.
- `renderTemplateWithDiagnostics(template, context)` retorna HTML + diagnostics.

Exemplo:

```ts
import { renderTemplateWithDiagnostics } from "../src/app/core/renderer";

const output = renderTemplateWithDiagnostics(
  '<div [class.]="isActive">{{ name | unknownPipe }}</div>',
  { isActive: true, name: "Erik" }
);

console.log(output.diagnostics);
```

Erros de parser de controle moderno agora incluem:

- Codigo do erro (ex: `IF_INVALID_BLOCK`, `FOR_INVALID_HEADER`).
- Linha e coluna aproximadas.
- Snippet de contexto para debug rapido.

## Playground Local

Para iterar rapido em template + contexto:

```bash
npm run build
npm run start:template:playground
```

Ou via CLI:

```bash
nexular template playground --port 3340 --host 127.0.0.1
```

Endpoints:

- `GET /` interface visual.
- `POST /render` renderiza template e retorna diagnostics.
- `GET /health` healthcheck.

## Recomendacoes de Uso

- Prefira `@if/@for/@switch` em vez de sintaxes antigas baseadas em diretivas estruturais.
- Prefira bindings `[class.*]`, `[style.*]`, `[attr.*]` para manter semantica explicita.
- Use pipes para formatacao de saida; mantenha regras de negocio fora do template.

## Migracao Rapida

### Antes (legado)

```html
<div *if="isOpen">...</div>
<li *for="let item of items">{{ item }}</li>
```

### Depois (novo padrao)

```html
@if (isOpen) {
<div>...</div>
} @for (item of items; track item) {
<li>{{ item }}</li>
}
```

## Estado Atual no Core

No pacote core desta workspace:

- Rota raiz (`/`) e o baseline oficial.
- Rotas demo (blog/forms/docs/login/starter) foram movidas para app de exemplo separado.
- Os testes do core foram rebaselinhados para esse contrato.
