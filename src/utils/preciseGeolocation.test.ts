import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { PreciseGeolocationError, requestPreciseGeolocation } from "./preciseGeolocation.ts";

type SuccessCallback = (position: GeolocationPosition) => void;
type ErrorCallback = (error: GeolocationPositionError) => void;

class MockGeolocation {
  successCallback: SuccessCallback | null = null;
  errorCallback: ErrorCallback | null = null;
  options: PositionOptions | undefined;
  clearedWatchIds: number[] = [];

  watchPosition(
    successCallback: SuccessCallback,
    errorCallback: ErrorCallback,
    options?: PositionOptions
  ) {
    this.successCallback = successCallback;
    this.errorCallback = errorCallback;
    this.options = options;
    return 17;
  }

  clearWatch(watchId: number) {
    this.clearedWatchIds.push(watchId);
  }

  emitPosition(accuracy: number) {
    this.successCallback?.({
      coords: {
        latitude: -23.55052,
        longitude: -46.633308,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    });
  }

  emitError(code: number) {
    this.errorCallback?.({
      code,
      message: "erro simulado",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    });
  }
}

test("aguarda a posição precisa e ignora a primeira posição aproximada", async () => {
  const geolocation = new MockGeolocation();
  const accuracies: number[] = [];
  const request = requestPreciseGeolocation(geolocation, {
    timeoutMs: 100,
    onAccuracyChange: (accuracy) => accuracies.push(accuracy),
  });
  let resolved = false;
  void request.promise.then(() => { resolved = true; });

  geolocation.emitPosition(850);
  await Promise.resolve();
  assert.equal(resolved, false);

  geolocation.emitPosition(72);
  const position = await request.promise;
  assert.equal(position.coords.accuracy, 72);
  assert.deepEqual(accuracies, [850, 72]);
  assert.deepEqual(geolocation.clearedWatchIds, [17]);
  assert.deepEqual(geolocation.options, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 100,
  });
});

test("ao terminar o tempo usa a melhor posição somente até 300 metros", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, { timeoutMs: 10 });
  geolocation.emitPosition(250);
  const position = await request.promise;
  assert.equal(position.coords.accuracy, 250);
  assert.deepEqual(geolocation.clearedWatchIds, [17]);
});

test("rejeita a melhor posição quando a precisão continua acima de 300 metros", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, { timeoutMs: 10 });
  geolocation.emitPosition(301);

  await assert.rejects(request.promise, (error: unknown) => {
    assert.ok(error instanceof PreciseGeolocationError);
    assert.equal(error.code, "INACCURATE");
    assert.match(error.message, /Vá para um local aberto/);
    return true;
  });
});

test("encerra imediatamente quando a permissão é negada", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, { timeoutMs: 100 });
  geolocation.emitError(1);

  await assert.rejects(request.promise, (error: unknown) => {
    assert.ok(error instanceof PreciseGeolocationError);
    assert.equal(error.code, "PERMISSION_DENIED");
    return true;
  });
  assert.deepEqual(geolocation.clearedWatchIds, [17]);
});

test("cancelamento limpa watch e timeout", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, { timeoutMs: 100 });
  request.cancel();

  await assert.rejects(request.promise, (error: unknown) => {
    assert.ok(error instanceof PreciseGeolocationError);
    assert.equal(error.code, "CANCELLED");
    return true;
  });
  assert.deepEqual(geolocation.clearedWatchIds, [17]);
});

