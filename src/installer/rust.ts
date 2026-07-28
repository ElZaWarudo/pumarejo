import { IntegrationPlanError } from "./plan-error.js";

const BUILDER = "tauri::Builder::default()";
const WRAPPED_BUILDER = `tauri_agent_builder(${BUILDER})`;
const MARKER_BEGIN = "// <tauri-agent:begin>";
const MARKER_END = "// <tauri-agent:end>";

const HELPER = `${MARKER_BEGIN}
#[cfg(all(debug_assertions, feature = "tauri-agent"))]
fn tauri_agent_builder<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder.plugin(tauri_plugin_wdio_webdriver::init())
}

#[cfg(not(all(debug_assertions, feature = "tauri-agent")))]
fn tauri_agent_builder<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder
}
${MARKER_END}

`;

function helperInsertionPoint(source: string): number {
  let index = 0;
  while (index < source.length && /\s/u.test(source[index])) {
    index += 1;
  }

  while (source.startsWith("#![", index)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
      } else if (character === '"') {
        inString = true;
      } else if (character === "[") {
        depth += 1;
      } else if (character === "]") {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
    }
    while (index < source.length && /\s/u.test(source[index])) {
      index += 1;
    }
  }
  return index;
}

export function rustBuilderOccurrences(source: string): number {
  return executableBuilderOffsets(source).length;
}

export function planRustEdit(source: string): string {
  if (source.includes(MARKER_BEGIN) || source.includes(MARKER_END)) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  const builderOffsets = executableBuilderOffsets(source);
  if (builderOffsets.length !== 1) {
    throw new IntegrationPlanError("RUST_LAYOUT_AMBIGUOUS");
  }

  const insertionPoint = helperInsertionPoint(source);
  const builderOffset = builderOffsets[0];
  const wrapped =
    source.slice(0, builderOffset) +
    WRAPPED_BUILDER +
    source.slice(builderOffset + BUILDER.length);
  return (
    wrapped.slice(0, insertionPoint) + HELPER + wrapped.slice(insertionPoint)
  );
}

export function planRustRemoval(source: string): string {
  const helperOccurrences = source.split(HELPER).length - 1;
  const wrapperOccurrences = source.split(WRAPPED_BUILDER).length - 1;
  if (helperOccurrences !== 1 || wrapperOccurrences !== 1) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  return source.replace(HELPER, "").replace(WRAPPED_BUILDER, BUILDER);
}

function executableBuilderOffsets(source: string): number[] {
  const code = source.split("");
  let index = 0;

  const mask = (start: number, end: number): void => {
    for (let position = start; position < end; position += 1) {
      if (code[position] !== "\n" && code[position] !== "\r") {
        code[position] = " ";
      }
    }
  };

  while (index < source.length) {
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      const boundary = end === -1 ? source.length : end;
      mask(index, boundary);
      index = boundary;
      continue;
    }

    if (source.startsWith("/*", index)) {
      const start = index;
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (source.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      mask(start, index);
      continue;
    }

    const rawPrefix = /^(?:br|r)(#+)?"/u.exec(source.slice(index));
    if (rawPrefix) {
      const start = index;
      const hashes = rawPrefix[1] ?? "";
      index += rawPrefix[0].length;
      const terminator = `"${hashes}`;
      const end = source.indexOf(terminator, index);
      index = end === -1 ? source.length : end + terminator.length;
      mask(start, index);
      continue;
    }

    const stringPrefix = source.startsWith('b"', index)
      ? 2
      : source[index] === '"'
        ? 1
        : 0;
    if (stringPrefix > 0) {
      const start = index;
      index += stringPrefix;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
        } else if (source[index] === '"') {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }
      mask(start, index);
      continue;
    }

    index += 1;
  }

  const executable = code.join("");
  const offsets: number[] = [];
  let offset = executable.indexOf(BUILDER);
  while (offset !== -1) {
    offsets.push(offset);
    offset = executable.indexOf(BUILDER, offset + BUILDER.length);
  }
  return offsets;
}
