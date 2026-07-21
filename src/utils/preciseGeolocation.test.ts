import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { PreciseGeolocationError, requestPreciseGeolocation } from "./preciseGeolocation.ts";

type SuccessCallback = (position: GeolocationPosition) => void;
type ErrorCallback = (error: GeolocationPositionError) => void;

class MockGeolocation {
  nextWatchId = 1;
  calls: Array<{
    id: number;
    success: SuccessCallback;
    error: ErrorCallback;
    options?: PositionOptions;
  }> = [];
  clearedWatchIds: number[] = [];

  watchPosition(
    success: SuccessCallback,
    error: ErrorCallback,
    options?: PositionOptions
  ) {
    const id = this.nextWatchId++;
    this.calls.push({ id, success, error, options });
    return id;
  }

  clearWatch(watchId: number) {
    this.clearedWatchIds.push(watchId);
  }

  emitPosition(
    watchId: number,
    accuracy: number,
    latitude = -23.55052,
    longitude = -46.633308
  ) {
    this.call(watchId).success(makePosition(accuracy, latitude, longitude));
  }

  emitError(watchId: number, code: 1 | 2 | 3, message = "erro simulado") {
    this.call(watchId).error({
      code,
      message,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    });
  }

  private call(watchId: number) {
    const call = this.calls.find((item) => item.id === watchId);
    assert.ok(call, `watch ${watchId} não encontrado`);
    return call;
  }
}

function makePosition(
  accuracy: number,
  latitude = -23.55052,
  longitude = -46.633308
): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

function fastTimeouts() {
  return {
    highAccuracyTimeoutMs: 8,
    fallbackTimeoutMs: 8,
    nativeTimeoutBufferMs: 1,
  };
}

async function assertGeolocationError(
  promise: Promise<GeolocationPosition>,
  code: PreciseGeolocationError["code"]
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PreciseGeolocationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("sucesso com alta precisão encerra a primeira chamada", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, fastTimeouts());

  geolocation.emitPosition(1, 45);

  assert.equal((await request.promise).coords.accuracy, 45);
  assert.equal(geolocation.calls.length, 1);
  assert.deepEqual(geolocation.calls[0].options, {
    enableHighAccuracy: true,
    maximumAge: 60_000,
    timeout: 7,
  });
  assert.deepEqual(geolocation.clearedWatchIds, [1]);
});

test("sucesso com precisão moderada não espera precisão perfeita", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, fastTimeouts());

  geolocation.emitPosition(1, 650);

  assert.equal((await request.promise).coords.accuracy, 650);
  assert.equal(geolocation.calls.length, 1);
});

test("aguarda uma leitura melhor antes de aceitar a precisão aproximada", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, {
    ...fastTimeouts(),
    maximumAccuracyMeters: 3_500,
    waitForPreferredAccuracy: true,
  });
  let resolved = false;
  void request.promise.then(() => {
    resolved = true;
  });

  geolocation.emitPosition(1, 2_000);
  await Promise.resolve();
  assert.equal(resolved, false);

  geolocation.emitPosition(1, 75);

  assert.equal((await request.promise).coords.accuracy, 75);
  assert.deepEqual(geolocation.clearedWatchIds, [1]);
});

test("usa a melhor leitura aproximada somente depois das tentativas precisas", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, {
    ...fastTimeouts(),
    maximumAccuracyMeters: 3_500,
    waitForPreferredAccuracy: true,
  });

  geolocation.emitPosition(1, 2_000);
  geolocation.emitError(1, 3);
  assert.equal(geolocation.calls.length, 2);

  geolocation.emitPosition(2, 2_000);
  assert.equal((await request.promise).coords.accuracy, 2_000);
  assert.deepEqual(geolocation.clearedWatchIds, [1, 2]);
});

test("timeout da alta precisão inicia fallback controlado", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, fastTimeouts());

  geolocation.emitError(1, 3);
  assert.equal(geolocation.calls.length, 2);
  assert.deepEqual(geolocation.calls[1].options, {
    enableHighAccuracy: false,
    maximumAge: 60_000,
    timeout: 7,
  });

  geolocation.emitPosition(2, 480);
  assert.equal((await request.promise).coords.accuracy, 480);
  assert.deepEqual(geolocation.clearedWatchIds, [1, 2]);
});

test("PERMISSION_DENIED encerra sem fallback e preserva a classificação", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, fastTimeouts());

  geolocation.emitError(1, 1, "User denied Geolocation");

  await assertGeolocationError(request.promise, "PERMISSION_DENIED");
  assert.equal(geolocation.calls.length, 1);
  assert.match(await rejectionMessage(request.promise), /permissão/i);
});

test("POSITION_UNAVAILABLE tenta fallback e informa o erro verdadeiro se ele também falhar", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, fastTimeouts());

  geolocation.emitError(1, 2);
  geolocation.emitError(2, 2);

  await assertGeolocationError(request.promise, "POSITION_UNAVAILABLE");
});

test("timeout nativo do fallback é classificado como TIMEOUT", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, fastTimeouts());

  geolocation.emitError(1, 3);
  geolocation.emitError(2, 3);

  await assertGeolocationError(request.promise, "TIMEOUT");
});

test("timeout manual inicia fallback e depois encerra como TIMEOUT", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, fastTimeouts());

  await new Promise((resolve) => setTimeout(resolve, 12));
  assert.equal(geolocation.calls.length, 2);
  await assertGeolocationError(request.promise, "TIMEOUT");
  assert.deepEqual(geolocation.clearedWatchIds, [1, 2]);
});

test("uma nova tentativa inicia normalmente depois de uma falha", async () => {
  const geolocation = new MockGeolocation();
  const failedRequest = requestPreciseGeolocation(geolocation, fastTimeouts());
  geolocation.emitError(1, 1);
  await assertGeolocationError(failedRequest.promise, "PERMISSION_DENIED");

  const retry = requestPreciseGeolocation(geolocation, fastTimeouts());
  geolocation.emitPosition(2, 90);

  assert.equal((await retry.promise).coords.accuracy, 90);
  assert.deepEqual(geolocation.clearedWatchIds, [1, 2]);
});

test("callback tardio da fase anterior não interfere no fallback", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, fastTimeouts());

  geolocation.emitError(1, 3);
  geolocation.emitPosition(1, 20, -10, -40);
  geolocation.emitPosition(2, 500, -23.5, -46.6);

  const position = await request.promise;
  assert.equal(position.coords.latitude, -23.5);
  assert.equal(position.coords.longitude, -46.6);
});

test("a mesma solicitação não resolve nem rejeita mais de uma vez", async () => {
  const geolocation = new MockGeolocation();
  const request = requestPreciseGeolocation(geolocation, fastTimeouts());

  geolocation.emitPosition(1, 80);
  geolocation.emitError(1, 1);
  request.cancel();

  assert.equal((await request.promise).coords.accuracy, 80);
  assert.equal(geolocation.calls.length, 1);
  assert.deepEqual(geolocation.clearedWatchIds, [1]);
});

async function rejectionMessage(promise: Promise<unknown>) {
  try {
    await promise;
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
