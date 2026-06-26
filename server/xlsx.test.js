import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbookBuffer } from './xlsx.js';

test('creates an xlsx workbook with the four expected columns', () => {
  const buffer = createWorkbookBuffer([
    {
      人物角色: '张三',
      服装: '黑色西装',
      出现集数: '第1集',
      详细描述: '开场出现'
    }
  ]);

  assert.equal(buffer.slice(0, 2).toString(), 'PK');
  const content = buffer.toString('utf8');
  assert.match(content, /角色名称/);
  assert.match(content, /服装/);
  assert.match(content, /出现集数/);
  assert.match(content, /详细描述/);
});

test('creates an xlsx workbook with role and scene sheets', () => {
  const buffer = createWorkbookBuffer(
    [
      {
        人物角色: '张三',
        服装: '黑色西装',
        出现集数: '第1集',
        详细描述: '开场出现'
      }
    ],
    [
      {
        主要场景: '外太空',
        出现集数: '第20集',
        具体场号: '20-1',
        场次数量: '1',
        剧本中场景描述: '舰队交火'
      }
    ]
  );

  const content = buffer.toString('utf8');
  assert.match(content, /角色资产表/);
  assert.match(content, /场景资产表/);
  assert.match(content, /主要场景/);
  assert.match(content, /剧本中场景描述/);
});
