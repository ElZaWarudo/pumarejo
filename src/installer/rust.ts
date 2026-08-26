import { IntegrationPlanError } from "./plan-error.js";

const BUILDER = "tauri::Builder::default()";
const WRAPPED_BUILDER = `pumarejo_builder(${BUILDER})`;
const MARKER_BEGIN = "// <pumarejo:begin>";
const MARKER_END = "// <pumarejo:end>";

const HELPER = `${MARKER_BEGIN}
#[cfg(all(debug_assertions, feature = "pumarejo"))]
fn pumarejo_builder<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.plugin(tauri_plugin_wdio_webdriver::init())
}

#[cfg(not(all(debug_assertions, feature = "pumarejo")))]
fn pumarejo_builder<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
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
  return executableOffsets(source, BUILDER).length;
}

export function rustWrappedBuilderOccurrences(source: string): number {
  return executableOffsets(source, WRAPPED_BUILDER).length;
}

export function planRustEdit(source: string): string {
  if (source.includes(MARKER_BEGIN) || source.includes(MARKER_END)) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  const builderOffsets = executableOffsets(source, BUILDER);
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
  const helperVariants = [HELPER, HELPER.replaceAll("\n", "\r\n")];
  const matchingHelpers = helperVariants.filter(
    (helper) => source.split(helper).length - 1 === 1,
  );
  const wrapperOffsets = executableOffsets(source, WRAPPED_BUILDER);
  if (matchingHelpers.length !== 1 || wrapperOffsets.length !== 1) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  const wrapperOffset = wrapperOffsets[0]!;
  const unwrapped =
    source.slice(0, wrapperOffset) +
    BUILDER +
    source.slice(wrapperOffset + WRAPPED_BUILDER.length);
  return unwrapped.replace(matchingHelpers[0]!, "");
}

function executableOffsets(source: string, needle: string): number[] {
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
  let offset = executable.indexOf(needle);
  while (offset !== -1) {
    offsets.push(offset);
    offset = executable.indexOf(needle, offset + needle.length);
  }
  return offsets;
}
