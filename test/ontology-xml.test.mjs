import test from "node:test";
import assert from "node:assert/strict";
import { parseOntologyMetadata, parseTermsFromOwl } from "../lib/ontology.mjs";

const namespaces = 'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#" xmlns:obo="http://purl.obolibrary.org/obo/" xmlns:oboInOwl="http://www.geneontology.org/formats/oboInOwl#"';
const iri = (id) => "http://purl.obolibrary.org/obo/" + id.replace(":", "_");

test("OWL class annotations after nested class expressions remain intact", () => {
  const xml = `<rdf:RDF ${namespaces}>
    <owl:Class rdf:about="${iri("SO:0001260")}"><rdfs:label>sequence_collection</rdfs:label></owl:Class>
    <owl:Class xml:lang="en" rdf:about='${iri("SO:0001026")}'>
      <owl:equivalentClass><owl:Class>
        <owl:intersectionOf rdf:parseType="Collection">
          <rdf:Description rdf:about="${iri("SO:0001260")}"/>
          <owl:Restriction><owl:someValuesFrom><owl:Class>
            <owl:intersectionOf rdf:parseType="Collection"><rdf:Description rdf:about="${iri("SO:0001235")}"/></owl:intersectionOf>
          </owl:Class></owl:someValuesFrom></owl:Restriction>
        </owl:intersectionOf>
      </owl:Class></owl:equivalentClass>
      <obo:IAO_0000115>A genome &amp; its &lt;sequences&gt;.</obo:IAO_0000115>
      <oboInOwl:hasExactSynonym>genomic &amp; collection</oboInOwl:hasExactSynonym>
      <oboInOwl:hasRelatedSynonym>genome set</oboInOwl:hasRelatedSynonym>
      <oboInOwl:hasAlternativeId>SO:9999999</oboInOwl:hasAlternativeId>
      <oboInOwl:hasDbXref>Example:1</oboInOwl:hasDbXref>
      <oboInOwl:inSubset rdf:resource="https://example.org/so#example_subset"/>
      <oboInOwl:hasOBONamespace>sequence</oboInOwl:hasOBONamespace>
      <rdfs:comment><![CDATA[Keep <literal> & text.]]></rdfs:comment>
      <oboInOwl:id>SO:0001026</oboInOwl:id>
      <rdfs:label xml:lang="en">ge&#110;ome</rdfs:label>
    </owl:Class>
    <owl:Axiom>
      <owl:annotatedSource rdf:resource="${iri("SO:0001026")}"/>
      <owl:annotatedProperty rdf:resource="http://purl.obolibrary.org/obo/IAO_0000115"/>
      <oboInOwl:hasDbXref>SO:immuno_workshop</oboInOwl:hasDbXref>
    </owl:Axiom>
  </rdf:RDF>`;
  const terms = parseTermsFromOwl(xml);
  assert.equal(terms.size, 2);
  const term = terms.get(iri("SO:0001026"));
  assert.equal(term.label, "genome");
  assert.deepEqual(term.definition, { text: "A genome & its <sequences>.", xrefs: ["SO:immuno_workshop"] });
  assert.deepEqual(term.synonyms, [{ scope: "exact", value: "genomic & collection" }, { scope: "related", value: "genome set" }]);
  assert.deepEqual(term.comments, ["Keep <literal> & text."]);
  assert.deepEqual(term.altIds, ["SO:9999999"]);
  assert.deepEqual(term.xrefs, ["Example:1"]);
  assert.deepEqual(term.subsets, ["example_subset"]);
  assert.equal(term.namespace, "sequence");
});

test("nested expression annotations are not inherited by the containing term", () => {
  const terms = parseTermsFromOwl(`<rdf:RDF ${namespaces}>
    <owl:Class rdf:about="${iri("SO:0001026")}">
      <owl:equivalentClass><owl:Class>
        <rdfs:label>Expression annotation</rdfs:label>
        <obo:IAO_0000115>Not the term's definition.</obo:IAO_0000115>
        <rdfs:comment>Not a term comment.</rdfs:comment>
        <oboInOwl:hasExactSynonym>Not a term synonym</oboInOwl:hasExactSynonym>
        <owl:deprecated>true</owl:deprecated>
        <obo:IAO_0100001 rdf:resource="${iri("SO:0001260")}"/>
      </owl:Class></owl:equivalentClass>
    </owl:Class>
  </rdf:RDF>`);
  const term = terms.get(iri("SO:0001026"));
  assert.equal(terms.size, 1);
  assert.equal(term.id, "SO:0001026");
  assert.equal(term.label, "");
  assert.deepEqual(term.definition, { text: "", xrefs: [] });
  assert.deepEqual(term.comments, []);
  assert.deepEqual(term.synonyms, []);
  assert.equal(term.isObsolete, false);
  assert.deepEqual(term.replacedBy, []);
});

test("OWL metadata accepts reordered attributes and decodes XML entities once", () => {
  const metadata = parseOntologyMetadata(`<rdf:RDF ${namespaces}>
    <owl:Ontology xml:lang="en" rdf:about='https://example.org/so.owl'>
      <owl:versionIRI xml:lang="en" rdf:resource='https://example.org/so.owl?version=1&amp;release=2'/>
      <oboInOwl:saved-by>A &amp; B</oboInOwl:saved-by>
      <oboInOwl:date>2026-11-04</oboInOwl:date>
      <oboInOwl:default-namespace>sequence</oboInOwl:default-namespace>
    </owl:Ontology>
  </rdf:RDF>`);
  assert.deepEqual(metadata, {
    ontologyIri: "https://example.org/so.owl",
    versionIri: "https://example.org/so.owl?version=1&release=2",
    savedBy: "A & B",
    releaseDate: "2026-11-04",
    defaultNamespace: "sequence"
  });
});
