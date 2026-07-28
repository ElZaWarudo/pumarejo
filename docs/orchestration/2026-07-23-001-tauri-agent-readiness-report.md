---
title: Tauri Agent Readiness Report
status: blocked
date: 2026-07-23
---

# Tauri Agent Readiness Report

## Context Found

| Source | Contribution | Confidence |
|---|---|---|
| Solicitud del usuario y adjunto de sesión | Define la identidad del producto: un paquete npm independiente y reutilizable (`@cie/tauri-agent`) que instrumenta aplicaciones Tauri 2 y expone observación e interacción mediante MCP. | High |
| Solicitud del usuario y adjunto de sesión | Propone una arquitectura inicial con CLI (`init`, `doctor`, `remove`), servidor MCP, cliente WebDriver, gestión del proceso Tauri e instalador. | High |
| Solicitud del usuario y adjunto de sesión | Propone la integración consumidora: `tauri-plugin-wdio-webdriver`, registro solo en debug, permiso de capability y `.tauri-agent.json`. | Medium |
| Solicitud del usuario y adjunto de sesión | Propone las herramientas MCP mínimas: `launch`, `snapshot`, `screenshot`, `click`, `type`, `press_key` y `close`. | High |
| Directorio de trabajo | El directorio está vacío y todavía no es un repositorio Git; no hay código, manifiestos, documentación, CI ni convenciones locales que verificar. | High |

## Missing Context

- **Product intent:** faltan usuarios/personas priorizados, escenarios de uso canónicos, criterios medibles de éxito para la primera versión y no-objetivos vinculantes.
- **Current system shape:** al ser un proyecto nuevo no existe una base técnica; falta convertir la arquitectura propuesta en decisiones aceptadas sobre módulos, ciclo de vida de sesiones, modelo de errores y límites entre CLI, MCP, WebDriver y proceso Tauri.
- **Technical execution context:** faltan versiones soportadas de Node.js, Tauri, Rust y sistemas operativos; formato del paquete, estrategia de build, gestor de versiones, comandos de lint/test/build y política de compatibilidad.
- **Data/interface context:** faltan contratos definitivos del CLI, schemas de entrada/salida y errores de las herramientas MCP, semántica y vigencia de `ref`, comportamiento multi-ventana, configuración y reglas de validación de `.tauri-agent.json`.
- **Delivery context:** faltan repositorio Git, rama base, convenciones de ramas/PR, CI, publicación npm, nombre/scope disponible, versionado, changelog y política de releases.
- **Existing scope context:** el adjunto propone una primera versión, pero no distingue requisitos obligatorios de ideas candidatas ni contiene un backlog aceptado con dependencias y criterios de aceptación.

## Why Roadmap Generation Is Unsafe

- Elegir qué herramientas y comandos entran en el primer incremento sin criterios de éxito ni no-objetivos convertiría una propuesta técnica en alcance de producto inventado.
- El contrato del MCP determina la arquitectura de sesión, snapshots, referencias y errores; planificar módulos y dependencias antes de fijarlo podría producir trabajo descartable o incompatible.
- La matriz de plataformas y versiones cambia la estrategia de procesos, puertos, WebDriver, pruebas y CI, por lo que también cambia el orden del roadmap.
- La ausencia de estrategia de publicación y flujo Git/CI impide proponer con seguridad ramas, paquetes revisables y PRs independientemente integrables.
- La integración con `tauri-plugin-wdio-webdriver` está descrita como recomendación técnica, pero debe validarse contra las versiones y plataformas objetivo antes de asumirla como contrato del producto.

## Blocking Questions

- ¿Quién usará la v1 y cuáles son los tres flujos que deben funcionar de extremo a extremo?
- ¿Qué criterios observables determinan que la v1 está terminada y qué queda explícitamente fuera?
- ¿Qué versiones mínimas de Node.js, Tauri 2 y Rust, y qué plataformas, deben soportarse?
- ¿Cuáles son los contratos definitivos de los comandos CLI, herramientas MCP, configuración, sesiones, referencias y errores?
- ¿Cómo se probará y publicará el paquete, y qué convenciones Git/CI/release debe seguir?
- ¿Qué partes del adjunto son requisitos aceptados y cuáles siguen siendo hipótesis por validar?

## Recommended Documents

- Crear `STRATEGY.md` con problema, usuarios, resultados, criterios de éxito, alcance v1, no-objetivos y restricciones.
- Crear `docs/product-requirements.md` con flujos canónicos, requisitos funcionales/no funcionales y criterios de aceptación.
- Crear `docs/architecture.md` con límites de módulos, ciclo de vida de procesos/sesiones, puertos, plataformas/versiones y decisiones sobre WebDriver.
- Crear `docs/contracts.md` con CLI, MCP, configuración, errores, snapshots, referencias y multi-ventana.
- Crear `docs/delivery-workflow.md` con Git, CI, pruebas, publicación npm, versionado y releases.

## Exact Next Prompt

```text
Usa compound-engineering:ce-brainstorm para redactar STRATEGY.md de Tauri Agent a partir de docs/orchestration/2026-07-23-001-tauri-agent-readiness-report.md y del brief adjunto; resuelve usuarios, resultados, criterios de éxito, alcance v1, no-objetivos, plataformas/versiones y restricciones sin implementar código.
```
