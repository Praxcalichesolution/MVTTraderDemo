from shell_app_factory import create_shell_app


app = create_shell_app("risk")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("risk_main:app", host="0.0.0.0", port=8002, reload=True, log_level="info")
