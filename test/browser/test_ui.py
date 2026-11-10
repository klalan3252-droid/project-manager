"""Browser tests for the web UI (F-2). Run: python3 -m pytest test/browser"""
import json
import os
import re
import socket
import subprocess
import time
import urllib.request

import pytest
from playwright.sync_api import expect, sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


@pytest.fixture()
def base():
    port = free_port()
    proc = subprocess.Popen(["node", "src/server.js"], cwd=ROOT, env={**os.environ, "PORT": str(port)},
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            urllib.request.urlopen(url + "/projects")
            break
        except Exception:
            time.sleep(0.1)
    yield url
    proc.terminate()
    proc.wait()


@pytest.fixture()
def page(base):
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.set_default_timeout(4000)
        pg.on("dialog", lambda d: d.accept())
        yield pg
        b.close()


def api(base, method, path, body=None):
    req = urllib.request.Request(base + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())


def item(page, text):
    return page.get_by_role("listitem").filter(has_text=text)


def add_project(page, name, desc=None):
    page.get_by_label(re.compile("name", re.I)).first.fill(name)
    if desc:
        page.get_by_label(re.compile("description", re.I)).first.fill(desc)
    page.get_by_label(re.compile("name", re.I)).first.press("Enter")


def test_empty_state_for_projects(page, base):
    page.goto(base)
    expect(page.get_by_text(re.compile("no projects", re.I))).to_be_visible()


def test_loading_indicator_while_fetching(page, base):
    def slow(route):
        time.sleep(1)
        route.continue_()
    page.route("**/projects", slow)
    page.goto(base)
    expect(page.get_by_text(re.compile("loading", re.I)).first).to_be_visible()
    expect(page.get_by_text(re.compile("no projects", re.I))).to_be_visible()


def test_lists_existing_projects(page, base):
    api(base, "POST", "/projects", {"name": "Seeded", "description": "from api"})
    page.goto(base)
    expect(item(page, "Seeded")).to_be_visible()
    expect(page.get_by_text(re.compile("no projects", re.I))).to_have_count(0)


def test_create_project_with_keyboard_updates_list(page, base):
    page.goto(base)
    add_project(page, "Alpha", "first one")
    expect(item(page, "Alpha")).to_be_visible()
    expect(item(page, "Alpha").get_by_text("first one")).to_be_visible()
    assert api(base, "GET", "/projects")[0]["name"] == "Alpha"


def test_project_name_is_required(page, base):
    page.goto(base)
    page.get_by_label(re.compile("name", re.I)).first.press("Enter")
    page.wait_for_timeout(300)
    assert api(base, "GET", "/projects") == []


def test_edit_project(page, base):
    api(base, "POST", "/projects", {"name": "Old", "description": "d"})
    page.goto(base)
    item(page, "Old").get_by_role("button", name=re.compile("edit", re.I)).click()
    box = page.get_by_role("listitem").get_by_label(re.compile("name", re.I))
    box.fill("Renamed")
    box.press("Enter")
    expect(item(page, "Renamed")).to_be_visible()
    assert api(base, "GET", "/projects")[0]["name"] == "Renamed"


def test_delete_project_shows_empty_state(page, base):
    api(base, "POST", "/projects", {"name": "Doomed"})
    page.goto(base)
    item(page, "Doomed").get_by_role("button", name=re.compile("delete", re.I)).click()
    expect(page.get_by_text(re.compile("no projects", re.I))).to_be_visible()
    assert api(base, "GET", "/projects") == []


def test_select_project_shows_tasks_empty_state_and_task_fields(page, base):
    p = api(base, "POST", "/projects", {"name": "Proj"})
    api(base, "POST", f"/projects/{p['id']}/tasks",
        {"title": "Write docs", "status": "in_progress", "assignee": "Sam", "due_date": "2030-01-15"})
    api(base, "POST", "/projects", {"name": "Empty"})
    page.goto(base)
    item(page, "Empty").get_by_text("Empty").click()
    expect(page.get_by_text(re.compile("no tasks", re.I))).to_be_visible()
    item(page, "Proj").get_by_text("Proj").click()
    t = item(page, "Write docs")
    expect(t).to_be_visible()
    expect(t).to_contain_text("Sam")
    expect(t).to_contain_text("2030")
    expect(t).to_contain_text(re.compile("in.progress", re.I))


def test_create_edit_complete_delete_task(page, base):
    p = api(base, "POST", "/projects", {"name": "Proj"})
    page.goto(base)
    item(page, "Proj").get_by_text("Proj").click()
    page.get_by_label(re.compile("title", re.I)).first.fill("Ship it")
    page.get_by_label(re.compile("assignee", re.I)).first.fill("Kim")
    page.get_by_label(re.compile("due", re.I)).first.fill("2031-02-03")
    page.get_by_label(re.compile("status", re.I)).first.select_option("in_progress")
    page.get_by_label(re.compile("title", re.I)).first.press("Enter")
    t = item(page, "Ship it")
    expect(t).to_be_visible()
    tasks = api(base, "GET", f"/projects/{p['id']}/tasks")
    assert tasks[0]["assignee"] == "Kim" and tasks[0]["due_date"] == "2031-02-03"
    assert tasks[0]["status"] == "in_progress"

    t.get_by_role("button", name=re.compile("edit", re.I)).click()
    box = page.get_by_role("listitem").get_by_label(re.compile("title", re.I))
    box.fill("Ship it now")
    box.press("Enter")
    expect(item(page, "Ship it now")).to_be_visible()

    item(page, "Ship it now").get_by_role("button", name=re.compile("complete", re.I)).click()
    expect(item(page, "Ship it now")).to_contain_text(re.compile("done", re.I))
    assert api(base, "GET", f"/projects/{p['id']}/tasks")[0]["status"] == "done"

    item(page, "Ship it now").get_by_role("button", name=re.compile("delete", re.I)).click()
    expect(page.get_by_text(re.compile("no tasks", re.I))).to_be_visible()
    assert api(base, "GET", f"/projects/{p['id']}/tasks") == []


def test_api_error_text_is_displayed(page, base):
    p = api(base, "POST", "/projects", {"name": "Ghost"})
    page.goto(base)
    expect(item(page, "Ghost")).to_be_visible()
    api(base, "DELETE", f"/projects/{p['id']}")
    expected = api(base, "PATCH", f"/projects/{p['id']}", {"name": "x"})["error"]
    item(page, "Ghost").get_by_role("button", name=re.compile("delete", re.I)).click()
    expect(page.get_by_role("alert")).to_contain_text(expected)


def test_api_text_is_not_injected_as_html(page, base):
    api(base, "POST", "/projects", {"name": "<b>bold</b>"})
    page.goto(base)
    expect(item(page, "<b>bold</b>")).to_be_visible()


def test_dynamic_fields_have_labels_and_layout_fits_mobile(page, base):
    api(base, "POST", "/projects", {"name": "Lbl"})
    page.set_viewport_size({"width": 360, "height": 740})
    page.goto(base)
    item(page, "Lbl").get_by_role("button", name=re.compile("edit", re.I)).click()
    fields = page.locator("input:visible, select:visible, textarea:visible")
    for i in range(fields.count()):
        f = fields.nth(i)
        if f.get_attribute("type") == "hidden":
            continue
        labelled = f.evaluate("e => (e.labels && e.labels.length > 0) || e.hasAttribute('aria-label') || e.hasAttribute('aria-labelledby')")
        assert labelled
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.keyboard.press("Tab")
    assert page.evaluate("document.activeElement !== document.body")
