# À intégrer au routeur FastAPI ACTUEL — ne remplacez pas le fichier entier.

# 1) Ajouter provincial_statistics à l'import app.api.routes
from app.api.routes import provincial_statistics

# 2) Ajouter :
api_router.include_router(
    provincial_statistics.router,
    prefix="/api/v1/discovery",
    tags=["discovery"],
)
