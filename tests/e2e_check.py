"""端到端检查：用 Selenium 打开站点，点按钮，确认页面真的算出了结果。

用法（先启动 http://127.0.0.1:8899）：
    python tests/e2e_check.py
"""

from __future__ import annotations

import sys
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

BASE = "http://127.0.0.1:8899"


def make_driver():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1360,1200")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    return webdriver.Chrome(options=options)


def wait_text(driver, selector, needle, timeout=25):
    def check(d):
        try:
            return needle in d.find_element(By.CSS_SELECTOR, selector).text
        except Exception:  # noqa: BLE001
            return False

    WebDriverWait(driver, timeout).until(check)


def main() -> int:
    driver = make_driver()
    failures = []
    try:
        # ---------- 引擎 ----------
        driver.get(BASE + "/engine.html")
        wait = WebDriverWait(driver, 20)
        wait.until(lambda d: d.execute_script("return !!window.M"))

        driver.find_element(By.ID, "run").click()
        wait_text(driver, "#status", "完成")
        latex = driver.find_element(By.ID, "result-latex").text
        print("engine simplify ->", latex.replace("\n", " ")[:120])
        if "katex" not in driver.find_element(By.ID, "result-latex").get_attribute("innerHTML"):
            failures.append("引擎结果没有渲染成 KaTeX")

        # 切到求导，点一个示例
        driver.find_element(By.CSS_SELECTOR, '.tab[data-op="diff"]').click()
        wait.until(lambda d: "阶数" in d.find_element(By.ID, "options").text)
        driver.find_element(By.CSS_SELECTOR, '#examples .tab').click()
        wait_text(driver, "#status", "完成", timeout=30)
        print("engine diff ->", driver.find_element(By.ID, "result-latex").text[:120])

        # 图像
        driver.find_element(By.CSS_SELECTOR, '.tab[data-op="plot"]').click()
        driver.find_element(By.CSS_SELECTOR, '#examples .tab').click()
        wait_text(driver, "#status", "完成", timeout=30)
        canvas_ok = driver.execute_script(
            "const c=document.querySelector('#chart');"
            "return c && c.width>0 && c.style.display!=='none';"
        )
        print("engine plot canvas ->", canvas_ok)
        if not canvas_ok:
            failures.append("函数图像画布没有出现")

        # ---------- 数字实验室 ----------
        driver.get(BASE + "/numbers.html?n=1729")
        wait_text(driver, "#lab-status", "完成", timeout=30)
        print("lab number ->", driver.find_element(By.ID, "big-number").text)
        facts = driver.find_elements(By.CSS_SELECTOR, "#facts .fact")
        print("lab facts ->", len(facts))
        if len(facts) < 3:
            failures.append("数字实验室的性质卡片太少")

        bars = driver.execute_script(
            "const c=document.querySelector('#freq-chart');"
            "return c && c.width>0;"
        )
        if not bars:
            failures.append("数字频率图没画出来")

        # ---------- 常数 ----------
        wait_text(driver, "#const-note", "位小数", timeout=30)
        value = driver.find_element(By.ID, "const-value").text
        print("constant pi ->", value[:40].replace("\n", " "))
        if not value.startswith("3.14"):
            failures.append("圆周率显示不正确")

        # ---------- 文章 ----------
        driver.get(BASE + "/article.html?slug=golden")
        wait.until(lambda d: "黄金比例" in d.find_element(By.ID, "article-title").text)
        katex_count = len(driver.find_elements(By.CSS_SELECTOR, "#article-body .katex"))
        print("article katex nodes ->", katex_count)
        if katex_count < 4:
            failures.append("文章里的公式没有渲染")

        logs = driver.get_log("browser")
        errors = [entry for entry in logs if entry.get("level") == "SEVERE"]
        for entry in errors:
            print("console error:", entry.get("message")[:200])
        if errors:
            failures.append(f"浏览器控制台有 {len(errors)} 个错误")
    finally:
        driver.quit()

    if failures:
        print("\nFAILED:")
        for item in failures:
            print(" -", item)
        return 1
    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
