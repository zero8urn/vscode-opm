import { add, multiply } from '../math';

describe('math utils', () => {
  test('add returns sum', () => {
    expect(add(1, 2)).toBe(3);
  });

  test('multiply returns product', () => {
    expect(multiply(3, 4)).toBe(12);
  });
});
