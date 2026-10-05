import { parseRemoteResource } from '../../src/course-evaluation';

const valid = { id: 'campus-inc-001', version: 1, status: 'assigned', payload: { category: 'connectivity' } };

test.each([
  ['sobre válido', valid, true],
  ['payload nulo y campo futuro', { ...valid, payload: null, future: true }, true],
  ['id vacío', { ...valid, id: ' ' }, false],
  ['status vacío', { ...valid, status: '' }, false],
  ['version textual', { ...valid, version: '1' }, false],
  ['version negativa', { ...valid, version: -1 }, false],
  ['version decimal', { ...valid, version: 1.5 }, false],
  ['payload de tipo incorrecto', { ...valid, payload: ['dato ficticio'] }, false],
  ['entrada nula', null, false],
])('contrato: %s', (_name, input, expected) => {
  const original = JSON.stringify(input);
  const result = parseRemoteResource(input);
  expect(result.ok).toBe(expected);
  expect(JSON.stringify(input)).toBe(original);
  if (result.ok) {
    expect(Object.keys(result.value).sort()).toEqual(['id', 'payload', 'status', 'version']);
  } else {
    expect(result.error).toBe('contract');
  }
});
