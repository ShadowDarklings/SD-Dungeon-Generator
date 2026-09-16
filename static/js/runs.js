import { apiFetch, readApiResponse } from "/site/src/api.js";
const status = document.getElementById("save-management-status");
const report = (error) => { status.textContent = error.message; };
async function request(path, method = "GET", body = {}) {
  const response = await apiFetch(path, { method, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
  return response.status === 204 ? {} : readApiResponse(response);
}
function row(label, commands) {
  const element = document.createElement("div");
  element.className = "d-flex flex-wrap align-items-center gap-3 py-2 border-bottom";
  const name = document.createElement("span");
  name.textContent = label;
  element.append(name);
  for (const [title, action] of commands) {
    const button = document.createElement("button");
    button.className = "btn btn-sm btn-outline-secondary";
    button.textContent = title;
    button.addEventListener("click", () => action().catch(report));
    element.append(button);
  }
  return element;
}
async function refresh() {
  const characters = await request("/api/characters?limit=100");
  const list = document.getElementById("private-character-list");
  list.replaceChildren(...characters.results.map((character) => row(character.name, [
    ["Export", async () => {
      const data = await request(`/api/characters/${character.id}`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data.character_json, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = "character.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }],
    ["Delete", async () => {
      if (!confirm("Delete this saved character? It can be recovered for 30 days.")) return;
      await request(`/api/characters/${character.id}`, "DELETE", { revision: character.revision });
      await refresh();
    }]
  ])));
  const deleted = await request("/api/recovery");
  document.getElementById("deleted-save-list").replaceChildren(...deleted.results.map((item) => row(item.name, [
    ["Restore", async () => {
      await request(`/api/recovery/${item.kind}/${item.id}`, "POST");
      location.reload();
    }]
  ])));
}
document.querySelectorAll(".delete-run-btn").forEach((button) => button.addEventListener("click", async () => {
  if (!confirm("Delete this game? It can be recovered for 30 days.")) return;
  try {
    await request(`/api/runs/${button.dataset.runId}`, "DELETE");
    button.closest("tr").remove();
    await refresh();
  } catch (error) { report(error); }
}));
document.querySelectorAll(".history-run-btn").forEach((button) => button.addEventListener("click", async () => {
  try {
    const history = await request(`/api/runs/${button.dataset.runId}/history`);
    document.getElementById("save-history").hidden = false;
    document.getElementById("save-history-list").replaceChildren(...history.results.map((item) => row(new Date(item.created_at).toLocaleString(), [
      ["Restore", async () => {
        if (!confirm("Restore this checkpoint? Your current save will be kept in history.")) return;
        await request(`/api/runs/${button.dataset.runId}/history/${item.id}/restore`, "POST", { revision: Number(button.dataset.revision) });
        location.reload();
      }]
    ])));
  } catch (error) { report(error); }
}));
void refresh().catch(report);
