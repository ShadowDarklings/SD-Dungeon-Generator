export class SeededRng {
  constructor(seed) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state;
  }

  nextFloat() {
    return this.next() / 0xffffffff;
  }

  nextInt(minInclusive, maxInclusive) {
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.nextFloat() * span);
  }

  pick(list) {
    if (!list.length) {
      return undefined;
    }
    return list[this.nextInt(0, list.length - 1)];
  }
}
