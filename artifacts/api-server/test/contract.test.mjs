import test, { after } from "node:test";
import assert from "node:assert/strict";

const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8080/api";
const workspaceA = `contract-a-${Date.now()}`;
const workspaceB = `contract-b-${Date.now()}`;
const createdIds = [];

async function request(path, options) {
  return fetch(`${base}${path}`, {
    headers: { "content-type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
}

after(async () => {
  await Promise.all(createdIds.map((id) => request(`/projects/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ workspaceId: workspaceA }),
  })));
});

test("auth route exposes an explicit unauthenticated state", async () => {
  const response = await request("/auth/user");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: null });
});

test("projects are isolated by workspace", async () => {
  const create = await request("/projects", {
    method: "POST",
    body: JSON.stringify({ workspaceId: workspaceA, name: "Contrat", prompt: "test", html: "<html><body>A</body></html>" }),
  });
  assert.equal(create.status, 201);
  const project = await create.json();
  createdIds.push(project.id);

  const hidden = await request(`/projects?workspaceId=${workspaceB}`);
  assert.equal(hidden.status, 200);
  assert.equal((await hidden.json()).some((item) => item.id === project.id), false);

  const forbiddenUpdate = await request(`/projects/${project.id}`, {
    method: "PATCH",
    body: JSON.stringify({ workspaceId: workspaceB, html: "<html><body>B</body></html>" }),
  });
  assert.equal(forbiddenUpdate.status, 404);
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
  });
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

  const versions = await (await request(`/projects/${project.id}/versions?workspaceId=${workspaceA}`)).json();
  assert.ok(versions.length >= 1);
});