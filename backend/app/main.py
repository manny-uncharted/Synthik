from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from scalar_fastapi import get_scalar_api_reference

from app.campaigns.routes import router as campaigns_router
from app.ai_verification.routes import router as ai_verification_router
from app.auth.routes import router as auth_router




app = FastAPI()

@app.get("/scalar", include_in_schema=False)
async def scalar_html():
    return get_scalar_api_reference(
        openapi_url=app.openapi_url,
        title=app.title,
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
        "http://localhost:3001",
        "http://localhost:3000",
        "https://app.hyvve.xyz",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", include_in_schema=False)
async def redirect_to_docs():
    """
    Redirects users from the root endpoint to the docs endpoint.
    """
    return RedirectResponse(url="/docs")


@app.get("/health")
def read_root():
    return {"Hello": "Service is live"}


app.include_router(campaigns_router, prefix="/campaigns")
app.include_router(ai_verification_router, prefix="/ai-verification")
app.include_router(auth_router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)