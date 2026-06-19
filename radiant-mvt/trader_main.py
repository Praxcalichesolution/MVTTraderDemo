from shell_app_factory import create_shell_app


app = create_shell_app("trader")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("trader_main:app", host="0.0.0.0", port=8001, reload=True, log_level="info")
