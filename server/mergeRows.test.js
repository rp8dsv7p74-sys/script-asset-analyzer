import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRoleRows, mergeSceneRows } from './mergeRows.js';

test('merges the same role into one row and keeps episode scene references', () => {
  const rows = mergeRoleRows([
    {
      人物角色: '林天',
      服装: '白色科研工作服',
      出现集数: '第1集1-1场',
      详细描述: '年轻科研专家'
    },
    {
      人物角色: '林天',
      服装: '深色西装',
      出现集数: '第2集2-1场；第3集3-2场',
      详细描述: '爱国，性格坚毅'
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].人物角色, '林天');
  assert.match(rows[0].出现集数, /第1集1-1场/);
  assert.match(rows[0].出现集数, /第2集2-1场/);
  assert.match(rows[0].服装, /白色科研工作服/);
  assert.match(rows[0].服装, /深色西装/);
});

test('merges the same scene into one row and counts scene references', () => {
  const rows = mergeSceneRows([
    {
      主要场景: '外太空/宇宙战场',
      出现集数: '第20集',
      具体场号: '20-1、20-2',
      场次数量: '2',
      剧本中场景描述: '舰队交火'
    },
    {
      主要场景: '外太空/宇宙战场',
      出现集数: '第21集',
      具体场号: '21-1',
      场次数量: '1',
      剧本中场景描述: '机甲撤退'
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].主要场景, '外太空/宇宙战场');
  assert.match(rows[0].出现集数, /第20集/);
  assert.match(rows[0].出现集数, /第21集/);
  assert.match(rows[0].具体场号, /20-1/);
  assert.match(rows[0].剧本中场景描述, /机甲撤退/);
  assert.equal(rows[0].场次数量, '3');
});
