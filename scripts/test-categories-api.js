import dotenv from "dotenv";
dotenv.config();

const BASE = `http://localhost:${process.env.PORT || 8080}/api/v1`;

async function req(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function main() {
  const login = await req("POST", "/auth/signin", {
    body: { username: "admin", password: "admin123" },
  });
  if (!login.status) throw new Error(login.message);
  const token = login.data.accessToken;

  const parent = await req("POST", "/categories", {
    token,
    body: { name: `Cat-Parent-${Date.now()}` },
  });
  if (!parent.status) throw new Error(parent.message);
  const parentId = parent.data.id;

  const sub = await req("POST", "/categories", {
    token,
    body: { name: `Cat-Sub-${Date.now()}`, parent_id: parentId },
  });
  if (!sub.status) throw new Error(sub.message);

  const tree = await req("GET", "/categories?tree=true", { token });
  if (!tree.status) throw new Error(tree.message);

  const subs = await req("GET", `/categories?parent_id=${parentId}`, { token });
  if (!subs.status || !subs.data.rows?.length) throw new Error("List subs failed");

  await req("DELETE", `/categories/${sub.data.id}`, { token });
  await req("DELETE", `/categories/${parentId}`, { token });

  console.log("Categories API smoke test passed.");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
