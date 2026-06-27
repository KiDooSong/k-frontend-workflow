// 최소 JSON Schema 검증기. ajv 같은 무거운 의존성을 피하고,
// frontmatter.schema.json 이 쓰는 키워드 부분집합만 지원한다:
//   type, required, properties, items, enum, pattern, format(date), additionalProperties(무시)
// 지원하지 않는 키워드는 통과시킨다 (느슨한 검증).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// YYYY-MM-DD 형식 + 실재하는 달력 날짜인지 (월 1-12, 일 유효)
export function isRealDate(s) {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v; // string | number | boolean | object
}

function checkType(value, type) {
  if (!type) return true;
  const types = Array.isArray(type) ? type : [type];
  const t = typeOf(value);
  return types.some((want) => {
    if (want === 'integer') return t === 'number' && Number.isInteger(value);
    return t === want;
  });
}

export function validateSchema(data, schema, pathPrefix = '') {
  const errors = [];
  walk(data, schema, pathPrefix, errors);
  return errors;
}

function walk(value, schema, p, errors) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.type && !checkType(value, schema.type)) {
    errors.push(`${p || '(root)'}: type 불일치 (기대 ${JSON.stringify(schema.type)}, 실제 ${typeOf(value)})`);
    return; // 타입이 틀리면 하위 검사 무의미
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${p || '(root)'}: enum 위반 (값 ${JSON.stringify(value)} ∉ ${JSON.stringify(schema.enum)})`);
  }

  if (schema.pattern && typeof value === 'string') {
    const re = new RegExp(schema.pattern);
    if (!re.test(value)) {
      errors.push(`${p || '(root)'}: pattern 불일치 (${schema.pattern})`);
    }
  }

  if (schema.format === 'date' && typeof value === 'string') {
    if (!isRealDate(value)) {
      errors.push(`${p}: date 형식 아님 (유효한 YYYY-MM-DD): ${JSON.stringify(value)}`);
    }
  }

  if (typeOf(value) === 'object') {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value) || value[key] === undefined || value[key] === null) {
          errors.push(`${p ? p + '.' : ''}${key}: 필수 필드 누락`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in value && value[key] !== undefined && value[key] !== null) {
          walk(value[key], subSchema, p ? `${p}.${key}` : key, errors);
        }
      }
    }
  }

  if (typeOf(value) === 'array' && schema.items) {
    value.forEach((item, i) => walk(item, schema.items, `${p}[${i}]`, errors));
  }
}
