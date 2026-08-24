from datetime import UTC, datetime

from app.schemas.company_network import CompanyNetworkNode
from app.services.company_relationship_extractor import (
    CompanyEntityIndex,
    RelationshipDocument,
    company_relationship_extractor,
    node_id,
)


def company(ticker: str | None, name: str, *, public: bool = True, node_type: str | None = None) -> CompanyNetworkNode:
    return CompanyNetworkNode(
        id=node_id(ticker, name),
        ticker=ticker,
        name=name,
        exchange="TSX" if ticker else None,
        country="Canada",
        sector="Industrials",
        industry=None,
        public_company=public,
        node_type=node_type or ("company" if public else "private_company"),
    )


def document(text: str, *, source_type: str = "annual_report", date: datetime | None = None, url: str = "https://issuer.example/annual-report") -> RelationshipDocument:
    return RelationshipDocument(
        source_type=source_type,
        title="Official annual report",
        url=url,
        text=text,
        issuer="MDA Space Ltd.",
        published_at=date or datetime(2026, 3, 31, tzinfo=UTC),
        document_date=date or datetime(2026, 3, 31, tzinfo=UTC),
    )


def extraction(text: str, *entities: CompanyNetworkNode, **kwargs):
    center = company("MDA", "MDA Space Ltd.")
    index = CompanyEntityIndex([center, *entities])
    nodes, relationships = company_relationship_extractor.extract(center, document(text, **kwargs), index)
    return center, nodes, relationships


def test_explicit_customer_direction_and_revenue_share_are_preserved() -> None:
    globalstar = company("GSAT", "Globalstar, Inc.")
    center, _, relationships = extraction(
        "Globalstar, Inc. is our major customer and represented 22% of our revenue.",
        globalstar,
    )
    relationship = relationships[0]
    assert relationship.relationship_type == "customer"
    assert relationship.source_node_id == center.id
    assert relationship.target_node_id == globalstar.id
    assert relationship.revenue_share_percent == 22
    assert relationship.materiality == "material"
    assert relationship.confidence == "verified"


def test_explicit_supplier_uses_supplier_to_customer_direction() -> None:
    honeywell = company("HON", "Honeywell International Inc.")
    center, _, relationships = extraction(
        "We purchased avionics from Honeywell International Inc.",
        honeywell,
    )
    relationship = relationships[0]
    assert relationship.relationship_type == "supplier"
    assert relationship.source_node_id == honeywell.id
    assert relationship.target_node_id == center.id


def test_partner_joint_venture_parent_subsidiary_and_contract() -> None:
    partner = company("SHOP", "Shopify Inc.")
    joint = company("RY", "Royal Bank of Canada")
    parent = company("BN", "Brookfield Corporation")
    subsidiary = company(None, "Satellite Labs", public=False)
    government = company(None, "Government of Canada", public=False, node_type="government")
    text = "\n".join((
        "We entered into a strategic partnership with Shopify Inc.",
        "We formed a joint venture with Royal Bank of Canada.",
        "MDA Space Ltd. is a subsidiary of Brookfield Corporation.",
        "Satellite Labs is our wholly owned subsidiary.",
        "MDA Space Ltd. was awarded a CAD 1.2 billion contract with Government of Canada.",
    ))
    _, _, relationships = extraction(text, partner, joint, parent, subsidiary, government)
    by_type = {item.relationship_type: item for item in relationships}
    assert {"strategic_partner", "joint_venture", "parent", "subsidiary", "major_contract"}.issubset(by_type)
    assert by_type["major_contract"].contract_value == 1_200_000_000
    assert by_type["major_contract"].contract_currency == "CAD"


def test_comention_without_explicit_relationship_is_rejected() -> None:
    tesla = company("TSLA", "Tesla, Inc.")
    _, nodes, relationships = extraction(
        "MDA Space Ltd. and Tesla, Inc. both attended the industry conference.",
        tesla,
    )
    assert nodes == []
    assert relationships == []


def test_unresolved_private_company_keeps_null_ticker() -> None:
    center, nodes, relationships = extraction(
        "We sourced components from Northstar Components.",
    )
    assert len(nodes) == len(relationships) == 1
    assert nodes[0].ticker is None
    assert nodes[0].public_company is False
    assert relationships[0].source_node_id == nodes[0].id
    assert relationships[0].target_node_id == center.id


def test_entity_resolution_accepts_only_exact_validated_aliases() -> None:
    nvidia = company("NVDA", "NVIDIA Corporation")
    index = CompanyEntityIndex()
    index.add(nvidia, aliases=("NVIDIA", "NVIDIA Corp"))

    assert index.resolve_exact("NVIDIA") == nvidia
    assert index.resolve_exact("nvidia corp.") == nvidia
    assert index.resolve_exact("NVID") is None
    assert index.resolve_exact("NVIDIA supplier") is None


def test_no_revenue_share_is_estimated_from_material_language() -> None:
    customer = company("TSLA", "Tesla, Inc.")
    _, _, relationships = extraction(
        "Tesla, Inc. is a material customer for our business.",
        customer,
    )
    assert relationships[0].revenue_share_percent is None


def test_old_official_relationship_becomes_historical() -> None:
    customer = company("TSLA", "Tesla, Inc.")
    _, _, relationships = extraction(
        "Tesla, Inc. was our major customer.",
        customer,
        date=datetime(2020, 3, 31, tzinfo=UTC),
    )
    assert relationships[0].status == "historical"


def test_real_sec_supplier_example_has_traceable_evidence() -> None:
    nvidia = company("NVDA", "NVIDIA Corporation")
    tsmc = company("TSM", "Taiwan Semiconductor Manufacturing Company Limited")
    index = CompanyEntityIndex([nvidia, tsmc])
    _, relationships = company_relationship_extractor.extract(
        nvidia,
        document(
            "We utilize foundries, such as Taiwan Semiconductor Manufacturing Company Limited, or TSMC, to produce our semiconductor wafers.",
            source_type="sec",
            url="https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm",
        ),
        index,
    )
    assert relationships[0].source_node_id == tsmc.id
    assert relationships[0].target_node_id == nvidia.id
    assert str(relationships[0].evidence[0].url).startswith("https://www.sec.gov/Archives/")


def test_real_mda_contract_example_extracts_only_published_value() -> None:
    center = company("MDA", "MDA Space Ltd.")
    globalstar = company("GSAT", "Globalstar, Inc.")
    index = CompanyEntityIndex([center, globalstar])
    _, relationships = company_relationship_extractor.extract(
        center,
        document(
            "MDA Space Ltd. signed a CAD $1.1 billion contract with Globalstar, Inc. to build its next generation LEO constellation.",
            source_type="press_release",
            url="https://mda.space/article/mda-space-signs-1.1b-contract-with-globalstar-to-build-next-generation-leo-constellation",
        ),
        index,
    )
    assert relationships[0].relationship_type == "major_contract"
    assert relationships[0].contract_value == 1_100_000_000
    assert relationships[0].contract_currency == "CAD"


def test_mda_pdf_heading_is_not_treated_as_a_company() -> None:
    globalstar = company("GSAT", "Globalstar, Inc.")
    _, nodes, relationships = extraction(
        "\n".join((
            "MDA SPACE SIGNS $1.1B CONTRACT WITH MDA SPACE ACHIEVES AN INDUSTRY FIRST IN DIGITAL BEAM FORMING.",
            "MDA Space Ltd. was awarded an approximate CAD $1.1 billion contract with Globalstar, Inc.",
        )),
        globalstar,
    )

    assert [node.name for node in nodes] == ["Globalstar, Inc."]
    assert len(relationships) == 1
    assert relationships[0].target_node_id == globalstar.id


def test_location_qualified_private_partner_is_deduplicated() -> None:
    _, nodes, relationships = extraction(
        "\n".join((
            "Partnership with ThothX Group supports the program.",
            "The standing offer, in partnership with Canadian-based ThothX Group, supports the mission.",
        )),
    )

    assert [node.name for node in nodes] == ["ThothX Group"]
    assert len(relationships) == 1
    assert len(relationships[0].evidence) == 2


def test_charitable_partnership_is_not_an_economic_relation() -> None:
    _, nodes, relationships = extraction(
        "In partnership with Indspire, an Indigenous national charity.",
    )

    assert nodes == []
    assert relationships == []
