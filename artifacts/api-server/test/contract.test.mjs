import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8080/api";
let workspaceA = `contract-a-${Date.now()}`;
const workspaceB = `contract-b-${Date.now()}`;
const createdIds = [];
let authCookie = "";

async function loadBrowserDependencyHelper() {
  const source = await readFile(new URL("../src/lib/browser-dependencies.ts", import.meta.url), "utf8");
  const transformed = await transform(source, { loader: "ts", format: "esm", target: "node20" });
  const module = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString("base64")}`);
  return module.ensureBrowserDependencies;
}

async function request(path, options = {}, withAuth = true) {
  const headers = new Headers({ "content-type": "application/json", ...(options?.headers ?? {}) });
  if (withAuth && authCookie) headers.set("cookie", authCookie);
  return fetch(`${base}${path}`, {
    ...options,
    headers,
  });
}

function sessionCookie(response) {
  const setCookieHeaders = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return setCookieHeaders.find((header) => header.startsWith("sid="))?.split(";", 1)[0] ?? "";
}

test("3D browser libraries are injected in dependency order without duplicates", async () => {
  const ensureBrowserDependencies = await loadBrowserDependencyHelper();
  const withoutDependencies = `<!doctype html><html><head><title>3D</title></head><body><script>const scene = new THREE.Scene(); const controls = new OrbitControls(camera, renderer.domElement);</script></body></html>`;
  const fixed = ensureBrowserDependencies(withoutDependencies);
  const threeScript = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  const controlsScript = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/controls/OrbitControls.js";

  assert.equal(fixed.match(new RegExp(threeScript, "g"))?.length, 1);
  assert.equal(fixed.match(new RegExp(controlsScript, "g"))?.length, 1);
  assert.ok(fixed.indexOf(threeScript) < fixed.indexOf(controlsScript));
  assert.ok(fixed.indexOf(controlsScript) < fixed.indexOf("<script>const scene"));

  const alreadyLoaded = `<!doctype html><html><head><script src="${threeScript}"></script></head><body><script>const scene = new THREE.Scene();</script></body></html>`;
  const unchangedDependency = ensureBrowserDependencies(alreadyLoaded);
  assert.equal(unchangedDependency.match(new RegExp(threeScript, "g"))?.length, 1);
});

after(async () => {
  await Promise.all(createdIds.map((id) => request(`/projects/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ workspaceId: workspaceA }),
  })));
});

test("Code Me accounts register and sign in with only a username and password", async () => {
  const username = `contract-${Date.now()}`;
  const password = "test-password-123";
  const registration = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }, false);
  assert.equal(registration.status, 201);
  const created = await registration.json();
  assert.equal(created.user.username, username.toLowerCase());
  assert.equal(created.user.email, null);
  assert.equal(created.authMethod, "password");
  workspaceA = created.user.id;

  const login = await request("/auth/password/login", {
    method: "POST",
    body: JSON.stringify({ username: username.toUpperCase(), password }),
  }, false);
  assert.equal(login.status, 200);
  authCookie = sessionCookie(login);
  assert.match(authCookie, /^sid=/);
});

test("auth route exposes an explicit unauthenticated state", async () => {
  const response = await request("/auth/user", {}, false);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: null, authMethod: null });
});

test("project routes reject requests without a signed-in account", async () => {
  const response = await request(`/projects?workspaceId=${workspaceA}`, {}, false);
  assert.equal(response.status, 401);
});

test("projects are isolated by workspace", async () => {
  const create = await request("/projects", {
    method: "POST",
    body: JSON.stringify({ workspaceId: workspaceA, name: "Contrat", prompt: "test", html: "<html><body>A</body></html>" }),
  });
  assert.equal(create.status, 201);
  const project = await create.json();
  createdIds.push(project.id);

  const memory = await request(`/projects/${project.id}/memory`);
  assert.equal(memory.status, 200);
  const memoryFiles = await memory.json();
  assert.equal(memoryFiles.length, 1);
  assert.equal(memoryFiles[0].name, "project-overview.md");
  assert.match(memoryFiles[0].content, /Demande initiale/);

  const hidden = await request(`/projects?workspaceId=${workspaceB}`);
  assert.equal(hidden.status, 404);

  const forbiddenUpdate = await request(`/projects/${project.id}`, {
    method: "PATCH",
    body: JSON.stringify({ workspaceId: workspaceB, html: "<html><body>B</body></html>" }),
  });
  assert.equal(forbiddenUpdate.status, 404);
});

test("project secrets stay hidden until explicitly revealed and support full lifecycle", async () => {
  const create = await request("/projects", {
    method: "POST",
    body: JSON.stringify({ workspaceId: workspaceA, name: "Secret contract", prompt: "", html: null }),
  });
  assert.equal(create.status, 201);
  const project = await create.json();
  createdIds.push(project.id);

  const secondProjectResponse = await request("/projects", {
    method: "POST",
    body: JSON.stringify({ workspaceId: workspaceA, name: "Other secret scope", prompt: "", html: null }),
  });
  assert.equal(secondProjectResponse.status, 201);
  const secondProject = await secondProjectResponse.json();
  createdIds.push(secondProject.id);

  const plaintext = "contract-secret-value-not-for-default-response";
  const createdSecretResponse = await request(`/projects/${project.id}/secrets`, {
    method: "POST",
    body: JSON.stringify({ name: "API_TOKEN_TEST", value: plaintext }),
  });
  assert.equal(createdSecretResponse.status, 201);
  const createdSecret = await createdSecretResponse.json();
  assert.equal(createdSecret.name, "API_TOKEN_TEST");
  assert.equal("value" in createdSecret, false);
  assert.equal("encryptedValue" in createdSecret, false);

  const duplicate = await request(`/projects/${project.id}/secrets`, {
    method: "POST",
    body: JSON.stringify({ name: "api_token_test", value: "another-test-value" }),
  });
  assert.equal(duplicate.status, 409);

  const list = await request(`/projects/${project.id}/secrets`);
  assert.equal(list.status, 200);
  const secrets = await list.json();
  assert.equal(secrets.length, 1);
  assert.equal(secrets[0].name, "API_TOKEN_TEST");
  assert.equal(JSON.stringify(secrets).includes(plaintext), false);
  assert.equal("value" in secrets[0], false);

  const emptyOtherProject = await request(`/projects/${secondProject.id}/secrets`);
  assert.deepEqual(await emptyOtherProject.json(), []);

  const unauthenticated = await request(`/projects/${project.id}/secrets`, {}, false);
  assert.equal(unauthenticated.status, 401);

  const revealed = await request(`/projects/${project.id}/secrets/${createdSecret.id}/reveal`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert.equal(revealed.status, 200);
  assert.deepEqual(await revealed.json(), { name: "API_TOKEN_TEST", value: plaintext });

  const replacement = "contract-secret-replacement-value";
  const updated = await request(`/projects/${project.id}/secrets/${createdSecret.id}`, {
    method: "PATCH",
    body: JSON.stringify({ value: replacement }),
  });
  assert.equal(updated.status, 200);
  assert.equal("value" in await updated.json(), false);
  const revealedReplacement = await request(`/projects/${project.id}/secrets/${createdSecret.id}/reveal`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert.deepEqual(await revealedReplacement.json(), { name: "API_TOKEN_TEST", value: replacement });

  const deleted = await request(`/projects/${project.id}/secrets/${createdSecret.id}`, { method: "DELETE" });
  assert.deepEqual(await deleted.json(), { success: true });
  const afterDelete = await request(`/projects/${project.id}/secrets/${createdSecret.id}/reveal`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert.equal(afterDelete.status, 404);
});

test("a project update creates a restorable version", async () => {
  const create = await request("/projects", {
    method: "POST",
    body: JSON.stringify({ workspaceId: workspaceA, name: "Versions", prompt: "test", html: "<html><body>v1</body></html>" }),
  });
  const project = await create.json();
  createdIds.push(project.id);

  const update = await request(`/projects/${project.id}`, {
    method: "PATCH",
    body: JSON.stringify({ workspaceId: workspaceA, html: "<html><body>v2</body></html>" }),
  });
  assert.equal(update.status, 200);

  const versionsResponse = await request(`/projects/${project.id}/versions?workspaceId=${workspaceA}`);
  assert.equal(versionsResponse.status, 200);
  const versions = await versionsResponse.json();
  assert.ok(versions.some((version) => version.html.includes("v1")));

  const original = versions.find((version) => version.html.includes("v1"));
  const restore = await request(`/projects/${project.id}/versions/${original.id}/restore`, {
    method: "POST",
    body: JSON.stringify({ workspaceId: workspaceA }),
  });
  assert.equal(restore.status, 200);
  assert.match((await restore.json()).html, /v1/);
});

test("storage upload URLs require authentication", async () => {
  const response = await request("/storage/uploads/request-url", {
    method: "POST",
    body: JSON.stringify({ name: "contract.txt", size: 8, contentType: "text/plain" }),
  }, false);
  assert.equal(response.status, 401);
});

test("empty project can be generated, improved, and versioned", { timeout: 180_000 }, async () => {
  const create = await request("/projects", {
    method: "POST",
    body: JSON.stringify({ workspaceId: workspaceA, name: "AI contract", prompt: "", html: null }),
  });
  const project = await create.json();
  createdIds.push(project.id);

  const generated = await request("/generate", {
    method: "POST",
    body: JSON.stringify({ prompt: "Crée une page HTML très simple avec un titre et un bouton." }),
  });
  assert.equal(generated.status, 200);
  const generatedPayload = await generated.json();
  assert.match(generatedPayload.html, /<html/i);

  const saved = await request(`/projects/${project.id}`, {
    method: "PATCH",
    body: JSON.stringify({ workspaceId: workspaceA, html: generatedPayload.html }),
  });
  assert.equal(saved.status, 200);

  const chat = await request(`/projects/${project.id}/chat`, {
    method: "POST",
    body: JSON.stringify({ workspaceId: workspaceA, message: "Ajoute un texte explicatif sous le bouton." }),
  });
  assert.equal(chat.status, 200);
  const chatPayload = await chat.json();
  assert.match(chatPayload.project.html, /<html/i);
  assert.ok(chatPayload.assistantMessage.content.length > 40);
  const updatedMemory = await (await request(`/projects/${project.id}/memory`)).json();
  assert.ok(updatedMemory.length >= 1 && updatedMemory.length <= 3);

  const versions = await (await request(`/projects/${project.id}/versions?workspaceId=${workspaceA}`)).json();
  assert.ok(versions.length >= 1);
});

test("Code Me account logout revokes the password session", async () => {
  const response = await request("/auth/logout", { method: "POST" });
  assert.equal(response.status, 200);
  authCookie = "";
  const authState = await request("/auth/user", {}, false);
  assert.deepEqual(await authState.json(), { user: null, authMethod: null });
});