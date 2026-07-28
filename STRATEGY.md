---
name: Tauri Agent
last_updated: 2026-07-23
---

# Tauri Agent Strategy

## Target problem

Los desarrolladores de aplicaciones Tauri que trabajan con agentes de código no pueden darles acceso directo a la interfaz de la aplicación sin ceder el control del escritorio completo.
Eso impide trabajar en paralelo y deja al agente sin el contexto visual y funcional necesario para entender los flujos existentes o proponer otros nuevos con sentido.

## Our approach

Construir un puente semántico pequeño y reutilizable entre cualquier aplicación Tauri 2 compatible y cualquier agente con soporte MCP.
El agente observará e interactuará con componentes de la WebView, como en un MCP de navegador, sin utilizar el ratón o el teclado del sistema y sin acoplar la promesa del producto a un mecanismo WebDriver concreto.

## Who it's for

**Primary:** Desarrolladores Tauri que trabajan con agentes de código - Contratan Tauri Agent para que el agente pueda revisar libremente la aplicación, comprender sus flujos y fundamentar cambios mientras ellos continúan usando el equipo.

## Key metrics

- **Sesiones utilizables** - Porcentaje de intentos que alcanzan un primer snapshot interactivo en la matriz certificada de Windows 11 y Ubuntu LTS.
- **Recorridos completados** - Porcentaje de recorridos de referencia que el agente completa mediante observación, clic, escritura y teclado semántico sin intervención humana.
- **Comprensión de flujos** - Porcentaje de flujos de referencia que el agente identifica y describe correctamente después de explorar la aplicación.
- **Propuestas aprovechables** - Porcentaje de nuevos flujos propuestos por el agente que encajan con el comportamiento observado sin requerir una corrección conceptual del desarrollador.
- **Interrupciones del escritorio** - Porcentaje de sesiones que inyectan entrada del sistema o impiden al desarrollador seguir trabajando; el objetivo aceptable es cero.

## Tracks

### Observación semántica fiel

Mantener una representación estable y verificable de lo que el usuario ve y de los componentes con los que puede interactuar.

_Why it serves the approach:_ La comprensión de flujos depende de que snapshots, capturas y referencias reflejen el estado real de la aplicación.

### Interacción aislada

Permitir sesiones visibles y ocultas que operen sobre la WebView sin controlar los dispositivos de entrada del sistema.

_Why it serves the approach:_ El producto solo resuelve el problema original si el desarrollador conserva el control del escritorio mientras el agente trabaja.

### Integración reutilizable

Sostener una instalación guiada y reversible para Tauri 2.x sobre las líneas Node.js LTS vigentes y Rust estable.

_Why it serves the approach:_ La herramienta debe poder incorporarse a proyectos diferentes sin copiar lógica, mantener una integración propia ni modificar las compilaciones de producción.

### Compatibilidad verificable

Certificar el flujo completo en Windows 11 y Ubuntu LTS, incluidos los modos visible y oculto.

_Why it serves the approach:_ La promesa debe depender de comportamiento probado en las plataformas objetivo, no de supuestos sobre WebDriver o la WebView.

## Not working on

- Control remoto del escritorio o inyección de ratón y teclado del sistema.
- Un explorador inteligente dentro del servidor MCP; la inteligencia y la elección del recorrido pertenecen al agente.
- Una plataforma de QA con grabación de pruebas, assertions, fixtures, mocks, interceptación de IPC o captura de logs.
- Instrumentación de APIs nativas de Tauri, runtime frontend o una crate Rust propia durante la v1.
- Soporte certificado para macOS, otras distribuciones Linux, múltiples ventanas o sesiones concurrentes durante la v1.

## Marketing

**One-liner:** Un MCP reutilizable que convierte cualquier aplicación Tauri 2 instrumentada en una interfaz observable y controlable por agentes.

**Key message:** El agente ve e interactúa con la misma aplicación que el desarrollador, pero lo hace mediante componentes de la WebView.
El desarrollador conserva el ratón, el teclado y el resto del escritorio para seguir trabajando en paralelo.
