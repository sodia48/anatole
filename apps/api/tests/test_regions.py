from app.services.regions import (
    ALL_CANADIAN_REGIONS,
    economic_regions,
    explicit_regions,
)


def test_explicit_provinces() -> None:
    assert explicit_regions(
        "Employment rose in Quebec and Ontario"
    ) == ["QC", "ON"]
    assert explicit_regions(
        "Le marché du travail au Nouveau-Brunswick"
    ) == ["NB"]


def test_shared_indicator_is_visible_for_all_provinces() -> None:
    regions = economic_regions(
        "Enquête sur la population active, juillet 2026"
    )
    assert regions == list(ALL_CANADIAN_REGIONS)


def test_national_only_release() -> None:
    assert economic_regions(
        "Bank of Canada policy update"
    ) == ["CA"]


def test_province_abbreviations() -> None:
    assert explicit_regions("Employment in B.C. increased") == ["BC"]
    assert explicit_regions("Perspectives en N.-B.") == ["NB"]


def test_all_ten_provinces_are_available() -> None:
    assert set(ALL_CANADIAN_REGIONS) == {
        "CA", "QC", "ON", "BC", "AB", "SK",
        "MB", "NB", "NS", "PE", "NL",
    }
