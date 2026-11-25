/**
 * A minimal stand-in for `foundry.data.fields` and `foundry.abstract.TypeDataModel`, so node tests
 * can import the data models in module/data/ and read their schemas.
 * Each field records its kind and options; SchemaField also keeps its child fields.
 * It does not validate or clean data the way Foundry does.
 */
class Field {
  constructor(options = {}) { this.options = options; }
}
const kind = k => class extends Field { kind = k; };
class SchemaField extends Field {
  kind = "schema";
  constructor(fields, options) { super(options); this.fields = fields; }
}
class ArrayField extends Field {
  kind = "array";
  constructor(element, options) { super(options); this.element = element; }
}

globalThis.foundry ??= {
  data: {
    fields: {
      NumberField: kind("number"), StringField: kind("string"), HTMLField: kind("html"),
      BooleanField: kind("boolean"), ObjectField: kind("object"), SchemaField, ArrayField,
      SetField: ArrayField, DocumentUUIDField: kind("string"), FilePathField: kind("string")
    }
  },
  abstract: { TypeDataModel: class TypeDataModel {} }
};
