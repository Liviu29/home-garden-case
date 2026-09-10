import { TestBed } from '@angular/core/testing';
import { GardenLayoutRepository } from './garden-layout-repository';

const KEY = (gardenId: number) => `homeGarden.visualLayout.v1.${gardenId}`;

/**
 * Planner layout persistence. Two invariants matter beyond round-tripping:
 * every read is DEFENSIVE (this is user-writable browser storage, so it must
 * never be trusted enough to crash the planner), and saves PRUNE positions for
 * plants that no longer exist so deleted plants can't resurrect coordinates.
 */
describe('GardenLayoutRepository', () => {
  let repo: GardenLayoutRepository;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    repo = TestBed.inject(GardenLayoutRepository);
  });

  describe('load', () => {
    it('returns an empty layout when nothing is stored', () => {
      expect(repo.load(1)).toEqual({});
    });

    it('round-trips saved positions', () => {
      repo.save(1, { 10: { x: 2, y: 3 } }, [10]);
      expect(repo.load(1)).toEqual({ 10: { x: 2, y: 3 } });
    });

    it('keeps gardens separate', () => {
      repo.save(1, { 10: { x: 1, y: 1 } }, [10]);
      repo.save(2, { 20: { x: 9, y: 9 } }, [20]);
      expect(repo.load(1)).toEqual({ 10: { x: 1, y: 1 } });
      expect(repo.load(2)).toEqual({ 20: { x: 9, y: 9 } });
    });

    it('ignores a payload from a different schema version', () => {
      localStorage.setItem(KEY(1), JSON.stringify({ v: 2, positions: { 10: { x: 1, y: 1 } } }));
      expect(repo.load(1)).toEqual({});
    });

    it('ignores a payload whose positions are not an object', () => {
      localStorage.setItem(KEY(1), JSON.stringify({ v: 1, positions: 'nope' }));
      expect(repo.load(1)).toEqual({});
    });

    it('ignores a payload whose positions are null', () => {
      localStorage.setItem(KEY(1), JSON.stringify({ v: 1, positions: null }));
      expect(repo.load(1)).toEqual({});
    });

    it('returns an empty layout for corrupt JSON rather than throwing', () => {
      localStorage.setItem(KEY(1), '{not json');
      expect(() => repo.load(1)).not.toThrow();
      expect(repo.load(1)).toEqual({});
    });

    it('drops individual entries with non-numeric or non-finite coordinates', () => {
      localStorage.setItem(
        KEY(1),
        JSON.stringify({
          v: 1,
          positions: {
            10: { x: 1, y: 2 }, // good
            11: { x: 'a', y: 2 }, // wrong type
            12: { x: 1 }, // missing y
            13: null, // no object
            14: { x: Number.NaN, y: 0 }, // not finite
            15: { x: 0, y: Number.POSITIVE_INFINITY }, // not finite
          },
        }),
      );
      expect(repo.load(1)).toEqual({ 10: { x: 1, y: 2 } });
    });

    it('drops entries whose key is not a number', () => {
      localStorage.setItem(
        KEY(1),
        JSON.stringify({ v: 1, positions: { abc: { x: 1, y: 2 }, 10: { x: 3, y: 4 } } }),
      );
      expect(repo.load(1)).toEqual({ 10: { x: 3, y: 4 } });
    });

    it('survives storage throwing on read', () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('SecurityError');
      });
      expect(repo.load(1)).toEqual({});
      getItem.mockRestore();
    });
  });

  describe('save', () => {
    it('prunes positions for plants that no longer exist', () => {
      repo.save(1, { 10: { x: 1, y: 1 }, 99: { x: 5, y: 5 } }, [10]);
      expect(repo.load(1)).toEqual({ 10: { x: 1, y: 1 } });
    });

    it('removes the entry entirely when nothing survives pruning', () => {
      repo.save(1, { 10: { x: 1, y: 1 } }, [10]);
      repo.save(1, { 10: { x: 1, y: 1 } }, []); // last plant deleted
      expect(localStorage.getItem(KEY(1))).toBeNull();
    });

    it('skips a plant id that has no stored position', () => {
      repo.save(1, { 10: { x: 1, y: 1 } }, [10, 11]);
      expect(repo.load(1)).toEqual({ 10: { x: 1, y: 1 } });
    });

    it('survives storage being unavailable', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      expect(() => repo.save(1, { 10: { x: 1, y: 1 } }, [10])).not.toThrow();
      setItem.mockRestore();
    });
  });

  describe('reset', () => {
    it('clears a garden layout', () => {
      repo.save(1, { 10: { x: 1, y: 1 } }, [10]);
      repo.reset(1);
      expect(repo.load(1)).toEqual({});
    });

    it('survives storage throwing', () => {
      const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('SecurityError');
      });
      expect(() => repo.reset(1)).not.toThrow();
      removeItem.mockRestore();
    });
  });
});
