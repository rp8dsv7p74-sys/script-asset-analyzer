export function mergeRoleRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const normalized = {
      人物角色: String(row.人物角色 || '').trim(),
      服装: String(row.服装 || '').trim(),
      出现集数: String(row.出现集数 || '未明确').trim(),
      详细描述: String(row.详细描述 || '').trim()
    };
    if (!normalized.人物角色) continue;

    const key = normalized.人物角色;
    const current = map.get(key);
    if (!current) {
      map.set(key, normalized);
      continue;
    }

    current.出现集数 = mergeTextList(current.出现集数, normalized.出现集数);
    current.服装 = mergeText(current.服装, normalized.服装);
    current.详细描述 = mergeText(current.详细描述, normalized.详细描述);
  }
  return [...map.values()];
}

export function mergeSceneRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const normalized = {
      主要场景: String(row.主要场景 || '').trim(),
      出现集数: String(row.出现集数 || '未明确').trim(),
      具体场号: String(row.具体场号 || '').trim(),
      场次数量: String(row.场次数量 || '').trim(),
      剧本中场景描述: String(row.剧本中场景描述 || '').trim()
    };
    if (!normalized.主要场景) continue;

    const key = normalized.主要场景;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        ...normalized,
        场次数量: normalized.场次数量 || countSceneRefs(normalized.具体场号)
      });
      continue;
    }

    current.出现集数 = mergeTextList(current.出现集数, normalized.出现集数);
    current.具体场号 = mergeTextList(current.具体场号, normalized.具体场号);
    current.剧本中场景描述 = mergeText(current.剧本中场景描述, normalized.剧本中场景描述);
    current.场次数量 = countSceneRefs(current.具体场号) || current.场次数量 || normalized.场次数量;
  }
  return [...map.values()];
}

export function mergeTextList(left, right) {
  const parts = [left, right]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[；;\n]+/))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(parts)].join('；');
}

export function mergeText(left, right) {
  if (!left) return right || '';
  if (!right || left.includes(right)) return left;
  if (right.includes(left)) return right;
  return `${left}；${right}`;
}

function countSceneRefs(value) {
  const refs = String(value || '')
    .split(/[、,，；;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return refs.length ? String(new Set(refs).size) : '';
}
