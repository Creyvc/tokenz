"""TokenSaver: separate method workbenches over the shared Python backend."""
import streamlit as st
from ui_workbenches import render_workbench

st.set_page_config(page_title="TokenSaver", layout="centered")
SCREENS = {"nlp": "NLP", "tfidf": "TF-IDF", "compare": "Compare methods", "qwen": "Qwen (optional)"}
if "active_workbench" not in st.session_state:
    requested = st.query_params.get("view", "nlp")
    st.session_state.active_workbench = requested if requested in SCREENS else "nlp"


def navigate():
    st.query_params["view"] = st.session_state.active_workbench


st.sidebar.title("TokenSaver")
st.sidebar.radio("Test screen", list(SCREENS), format_func=SCREENS.get,
                 key="active_workbench", on_change=navigate)
st.sidebar.caption("Each screen keeps its own prompt, settings and results.")
st.title("TokenSaver")
render_workbench(st.session_state.active_workbench)
st.divider()
st.caption("Counts measure prompt text. Shorter text does not prove equivalent meaning or ChatGPT subscription savings. Review every task and constraint before use.")
