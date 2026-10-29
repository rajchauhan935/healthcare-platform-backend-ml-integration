'use strict';

const {
  createHospitalCapacityTransactionRepository,
} = require('../src/repositories/hospitalCapacityTransactionRepository');

describe('Hospital capacity transaction repository', () => {


  const current = {
    id: 'H-001',
    generalBedsTotal: 100,
    generalBedsFree: 40,
    icuBedsTotal: 20,
    icuBedsFree: 5,
  };

  function setup(options = {}) {
    const client = {
      query: jest.fn(),
      release: jest.fn(),
    };

    client.query.mockImplementation(async (sql) => {
      const statement = sql.trim();

      if (
        statement === 'BEGIN' ||
        statement === 'COMMIT' ||
        statement === 'ROLLBACK'
      ) {
        return { rows: [] };
      }

      if (statement.startsWith('SELECT')) {
        return {
          rows: options.missing ? [] : [{ ...current }],
        };
      }

      if (statement.startsWith('UPDATE')) {
        if (options.updateFailure) {
          throw new Error('Synthetic SQL failure');
        }

        return {
          rows: [{
            ...current,
            generalBedsFree: 35,
          }],
        };
      }

      throw new Error('Unexpected SQL statement');
    });

    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    };

    const repository =
      createHospitalCapacityTransactionRepository(pool);

    return { repository, pool, client };
  }


  test('requires an injected pool', () => {
    expect(() =>
      createHospitalCapacityTransactionRepository()
    ).toThrow(TypeError);
  });

  test('locks, validates and updates capacity in one transaction', async () => {
    const { repository, client } = setup();

    const result = await repository.updateCapacity(
      'H-001',
      { generalBedsFree: 35 }
    );

    expect(result.generalBedsFree).toBe(35);

    const statements = client.query.mock.calls.map(
      ([sql]) => sql.trim()
    );

    expect(statements[0]).toBe('BEGIN');
    expect(statements[1]).toContain('FOR UPDATE');
    expect(statements[2]).toContain('UPDATE hospitals');
    expect(statements[3]).toBe('COMMIT');

    expect(client.query.mock.calls[1][1]).toEqual(['H-001']);

    expect(client.query.mock.calls[2][1]).toEqual([
      'H-001',
      100,
      35,
      20,
      5,
    ]);

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('returns null for a missing hospital', async () => {
    const { repository, client } = setup({
      missing: true,
    });

    const result = await repository.updateCapacity(
      'H-999',
      { icuBedsFree: 4 }
    );

    expect(result).toBeNull();

    expect(
      client.query.mock.calls.map(([sql]) => sql.trim())
    ).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      'COMMIT',
    ]);

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('rolls back an invalid capacity update', async () => {
    const { repository, client } = setup();

    await expect(
      repository.updateCapacity(
        'H-001',
        { generalBedsFree: 101 }
      )
    ).rejects.toMatchObject({
      code: 'INVALID_CAPACITY',
    });

    const statements = client.query.mock.calls.map(
      ([sql]) => sql.trim()
    );

    expect(statements).toContain('ROLLBACK');

    expect(
      statements.some(sql => sql.startsWith('UPDATE'))
    ).toBe(false);

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('rolls back when the UPDATE fails', async () => {
    const { repository, client } = setup({
      updateFailure: true,
    });

    await expect(
      repository.updateCapacity(
        'H-001',
        { generalBedsFree: 35 }
      )
    ).rejects.toThrow('Synthetic SQL failure');

    const statements = client.query.mock.calls.map(
      ([sql]) => sql.trim()
    );

    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('rejects an invalid hospital ID before connecting', async () => {
    const { repository, pool } = setup();

    await expect(
      repository.updateCapacity('', { icuBedsFree: 4 })
    ).rejects.toThrow(TypeError);

    expect(pool.connect).not.toHaveBeenCalled();
  });



  test('rejects when acquiring a database client fails', async () => {
    const pool = {
      connect: jest.fn().mockRejectedValue(
        new Error('Synthetic connection failure')
      ),
    };

    const repository =
      createHospitalCapacityTransactionRepository(pool);

    await expect(
      repository.updateCapacity(
        'H-001',
        { icuBedsFree: 4 }
      )
    ).rejects.toThrow('Synthetic connection failure');

    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  test('releases the client when BEGIN fails', async () => {
    const { repository, client } = setup();

    client.query.mockImplementation(async (sql) => {
      if (sql.trim() === 'BEGIN') {
        throw new Error('Synthetic BEGIN failure');
      }

      return { rows: [] };
    });

    await expect(
      repository.updateCapacity(
        'H-001',
        { icuBedsFree: 4 }
      )
    ).rejects.toThrow('Synthetic BEGIN failure');

    expect(client.release).toHaveBeenCalledTimes(1);

    expect(
      client.query.mock.calls.map(([sql]) => sql.trim())
    ).toEqual(['BEGIN']);
  });

  test('rolls back and releases when locked SELECT fails', async () => {
    const { repository, client } = setup();

    client.query.mockImplementation(async (sql) => {
      const statement = sql.trim();

      if (statement.startsWith('SELECT')) {
        throw new Error('Synthetic SELECT failure');
      }

      return { rows: [] };
    });

    await expect(
      repository.updateCapacity(
        'H-001',
        { icuBedsFree: 4 }
      )
    ).rejects.toThrow('Synthetic SELECT failure');

    expect(
      client.query.mock.calls.map(([sql]) => sql.trim())
    ).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      'ROLLBACK',
    ]);

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('rolls back and releases when COMMIT fails', async () => {
    const { repository, client } = setup();

    const originalQuery = client.query.getMockImplementation();

    client.query.mockImplementation(async (sql, params) => {
      if (sql.trim() === 'COMMIT') {
        throw new Error('Synthetic COMMIT failure');
      }

      return originalQuery(sql, params);
    });

    await expect(
      repository.updateCapacity(
        'H-001',
        { generalBedsFree: 35 }
      )
    ).rejects.toThrow('Synthetic COMMIT failure');

    const statements = client.query.mock.calls.map(
      ([sql]) => sql.trim()
    );

    expect(statements).toContain('COMMIT');
    expect(statements).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('preserves the original error if ROLLBACK also fails', async () => {
    const { repository, client } = setup();

    client.query.mockImplementation(async (sql) => {
      const statement = sql.trim();

      if (statement === 'ROLLBACK') {
        throw new Error('Synthetic ROLLBACK failure');
      }

      if (statement.startsWith('SELECT')) {
        throw new Error('Original SELECT failure');
      }

      return { rows: [] };
    });

    await expect(
      repository.updateCapacity(
        'H-001',
        { icuBedsFree: 4 }
      )
    ).rejects.toThrow('Original SELECT failure');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('returns null when UPDATE returns no row', async () => {
    const { repository, client } = setup();

    const originalQuery = client.query.getMockImplementation();

    client.query.mockImplementation(async (sql, params) => {
      if (sql.trim().startsWith('UPDATE')) {
        return { rows: [] };
      }

      return originalQuery(sql, params);
    });

    const result = await repository.updateCapacity(
      'H-001',
      { generalBedsFree: 35 }
    );

    expect(result).toBeNull();
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

});