var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/entity.js
var entityKind = Symbol.for("drizzle:entityKind");
var hasOwnEntityKind = Symbol.for("drizzle:hasOwnEntityKind");
function is(value, type) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (value instanceof type) {
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(type, entityKind)) {
    throw new Error(
      `Class "${type.name ?? "<unknown>"}" doesn't look like a Drizzle entity. If this is incorrect and the class is provided by Drizzle, please report this as a bug.`
    );
  }
  let cls = Object.getPrototypeOf(value).constructor;
  if (cls) {
    while (cls) {
      if (entityKind in cls && cls[entityKind] === type[entityKind]) {
        return true;
      }
      cls = Object.getPrototypeOf(cls);
    }
  }
  return false;
}
__name(is, "is");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/logger.js
var ConsoleLogWriter = class {
  static {
    __name(this, "ConsoleLogWriter");
  }
  static [entityKind] = "ConsoleLogWriter";
  write(message) {
    console.log(message);
  }
};
var DefaultLogger = class {
  static {
    __name(this, "DefaultLogger");
  }
  static [entityKind] = "DefaultLogger";
  writer;
  constructor(config) {
    this.writer = config?.writer ?? new ConsoleLogWriter();
  }
  logQuery(query, params) {
    const stringifiedParams = params.map((p) => {
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    });
    const paramsStr = stringifiedParams.length ? ` -- params: [${stringifiedParams.join(", ")}]` : "";
    this.writer.write(`Query: ${query}${paramsStr}`);
  }
};
var NoopLogger = class {
  static {
    __name(this, "NoopLogger");
  }
  static [entityKind] = "NoopLogger";
  logQuery() {
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/table.utils.js
var TableName = Symbol.for("drizzle:Name");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/table.js
var Schema = Symbol.for("drizzle:Schema");
var Columns = Symbol.for("drizzle:Columns");
var ExtraConfigColumns = Symbol.for("drizzle:ExtraConfigColumns");
var OriginalName = Symbol.for("drizzle:OriginalName");
var BaseName = Symbol.for("drizzle:BaseName");
var IsAlias = Symbol.for("drizzle:IsAlias");
var ExtraConfigBuilder = Symbol.for("drizzle:ExtraConfigBuilder");
var IsDrizzleTable = Symbol.for("drizzle:IsDrizzleTable");
var Table = class {
  static {
    __name(this, "Table");
  }
  static [entityKind] = "Table";
  /** @internal */
  static Symbol = {
    Name: TableName,
    Schema,
    OriginalName,
    Columns,
    ExtraConfigColumns,
    BaseName,
    IsAlias,
    ExtraConfigBuilder
  };
  /**
   * @internal
   * Can be changed if the table is aliased.
   */
  [TableName];
  /**
   * @internal
   * Used to store the original name of the table, before any aliasing.
   */
  [OriginalName];
  /** @internal */
  [Schema];
  /** @internal */
  [Columns];
  /** @internal */
  [ExtraConfigColumns];
  /**
   *  @internal
   * Used to store the table name before the transformation via the `tableCreator` functions.
   */
  [BaseName];
  /** @internal */
  [IsAlias] = false;
  /** @internal */
  [IsDrizzleTable] = true;
  /** @internal */
  [ExtraConfigBuilder] = void 0;
  constructor(name, schema, baseName) {
    this[TableName] = this[OriginalName] = name;
    this[Schema] = schema;
    this[BaseName] = baseName;
  }
};
function getTableName(table) {
  return table[TableName];
}
__name(getTableName, "getTableName");
function getTableUniqueName(table) {
  return `${table[Schema] ?? "public"}.${table[TableName]}`;
}
__name(getTableUniqueName, "getTableUniqueName");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/column.js
var Column = class {
  static {
    __name(this, "Column");
  }
  constructor(table, config) {
    this.table = table;
    this.config = config;
    this.name = config.name;
    this.keyAsName = config.keyAsName;
    this.notNull = config.notNull;
    this.default = config.default;
    this.defaultFn = config.defaultFn;
    this.onUpdateFn = config.onUpdateFn;
    this.hasDefault = config.hasDefault;
    this.primary = config.primaryKey;
    this.isUnique = config.isUnique;
    this.uniqueName = config.uniqueName;
    this.uniqueType = config.uniqueType;
    this.dataType = config.dataType;
    this.columnType = config.columnType;
    this.generated = config.generated;
    this.generatedIdentity = config.generatedIdentity;
  }
  static [entityKind] = "Column";
  name;
  keyAsName;
  primary;
  notNull;
  default;
  defaultFn;
  onUpdateFn;
  hasDefault;
  isUnique;
  uniqueName;
  uniqueType;
  dataType;
  columnType;
  enumValues = void 0;
  generated = void 0;
  generatedIdentity = void 0;
  config;
  mapFromDriverValue(value) {
    return value;
  }
  mapToDriverValue(value) {
    return value;
  }
  // ** @internal */
  shouldDisableInsert() {
    return this.config.generated !== void 0 && this.config.generated.type !== "byDefault";
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/column-builder.js
var ColumnBuilder = class {
  static {
    __name(this, "ColumnBuilder");
  }
  static [entityKind] = "ColumnBuilder";
  config;
  constructor(name, dataType, columnType) {
    this.config = {
      name,
      keyAsName: name === "",
      notNull: false,
      default: void 0,
      hasDefault: false,
      primaryKey: false,
      isUnique: false,
      uniqueName: void 0,
      uniqueType: void 0,
      dataType,
      columnType,
      generated: void 0
    };
  }
  /**
   * Changes the data type of the column. Commonly used with `json` columns. Also, useful for branded types.
   *
   * @example
   * ```ts
   * const users = pgTable('users', {
   * 	id: integer('id').$type<UserId>().primaryKey(),
   * 	details: json('details').$type<UserDetails>().notNull(),
   * });
   * ```
   */
  $type() {
    return this;
  }
  /**
   * Adds a `not null` clause to the column definition.
   *
   * Affects the `select` model of the table - columns *without* `not null` will be nullable on select.
   */
  notNull() {
    this.config.notNull = true;
    return this;
  }
  /**
   * Adds a `default <value>` clause to the column definition.
   *
   * Affects the `insert` model of the table - columns *with* `default` are optional on insert.
   *
   * If you need to set a dynamic default value, use {@link $defaultFn} instead.
   */
  default(value) {
    this.config.default = value;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Adds a dynamic default value to the column.
   * The function will be called when the row is inserted, and the returned value will be used as the column value.
   *
   * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
   */
  $defaultFn(fn) {
    this.config.defaultFn = fn;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Alias for {@link $defaultFn}.
   */
  $default = this.$defaultFn;
  /**
   * Adds a dynamic update value to the column.
   * The function will be called when the row is updated, and the returned value will be used as the column value if none is provided.
   * If no `default` (or `$defaultFn`) value is provided, the function will be called when the row is inserted as well, and the returned value will be used as the column value.
   *
   * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
   */
  $onUpdateFn(fn) {
    this.config.onUpdateFn = fn;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Alias for {@link $onUpdateFn}.
   */
  $onUpdate = this.$onUpdateFn;
  /**
   * Adds a `primary key` clause to the column definition. This implicitly makes the column `not null`.
   *
   * In SQLite, `integer primary key` implicitly makes the column auto-incrementing.
   */
  primaryKey() {
    this.config.primaryKey = true;
    this.config.notNull = true;
    return this;
  }
  /** @internal Sets the name of the column to the key within the table definition if a name was not given. */
  setName(name) {
    if (this.config.name !== "") return;
    this.config.name = name;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/pg-core/foreign-keys.js
var ForeignKeyBuilder = class {
  static {
    __name(this, "ForeignKeyBuilder");
  }
  static [entityKind] = "PgForeignKeyBuilder";
  /** @internal */
  reference;
  /** @internal */
  _onUpdate = "no action";
  /** @internal */
  _onDelete = "no action";
  constructor(config, actions) {
    this.reference = () => {
      const { name, columns, foreignColumns } = config();
      return { name, columns, foreignTable: foreignColumns[0].table, foreignColumns };
    };
    if (actions) {
      this._onUpdate = actions.onUpdate;
      this._onDelete = actions.onDelete;
    }
  }
  onUpdate(action) {
    this._onUpdate = action === void 0 ? "no action" : action;
    return this;
  }
  onDelete(action) {
    this._onDelete = action === void 0 ? "no action" : action;
    return this;
  }
  /** @internal */
  build(table) {
    return new ForeignKey(table, this);
  }
};
var ForeignKey = class {
  static {
    __name(this, "ForeignKey");
  }
  constructor(table, builder) {
    this.table = table;
    this.reference = builder.reference;
    this.onUpdate = builder._onUpdate;
    this.onDelete = builder._onDelete;
  }
  static [entityKind] = "PgForeignKey";
  reference;
  onUpdate;
  onDelete;
  getName() {
    const { name, columns, foreignColumns } = this.reference();
    const columnNames = columns.map((column) => column.name);
    const foreignColumnNames = foreignColumns.map((column) => column.name);
    const chunks = [
      this.table[TableName],
      ...columnNames,
      foreignColumns[0].table[TableName],
      ...foreignColumnNames
    ];
    return name ?? `${chunks.join("_")}_fk`;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/tracing-utils.js
function iife(fn, ...args) {
  return fn(...args);
}
__name(iife, "iife");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/pg-core/unique-constraint.js
function uniqueKeyName(table, columns) {
  return `${table[TableName]}_${columns.join("_")}_unique`;
}
__name(uniqueKeyName, "uniqueKeyName");
var UniqueConstraintBuilder = class {
  static {
    __name(this, "UniqueConstraintBuilder");
  }
  constructor(columns, name) {
    this.name = name;
    this.columns = columns;
  }
  static [entityKind] = "PgUniqueConstraintBuilder";
  /** @internal */
  columns;
  /** @internal */
  nullsNotDistinctConfig = false;
  nullsNotDistinct() {
    this.nullsNotDistinctConfig = true;
    return this;
  }
  /** @internal */
  build(table) {
    return new UniqueConstraint(table, this.columns, this.nullsNotDistinctConfig, this.name);
  }
};
var UniqueOnConstraintBuilder = class {
  static {
    __name(this, "UniqueOnConstraintBuilder");
  }
  static [entityKind] = "PgUniqueOnConstraintBuilder";
  /** @internal */
  name;
  constructor(name) {
    this.name = name;
  }
  on(...columns) {
    return new UniqueConstraintBuilder(columns, this.name);
  }
};
var UniqueConstraint = class {
  static {
    __name(this, "UniqueConstraint");
  }
  constructor(table, columns, nullsNotDistinct, name) {
    this.table = table;
    this.columns = columns;
    this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
    this.nullsNotDistinct = nullsNotDistinct;
  }
  static [entityKind] = "PgUniqueConstraint";
  columns;
  name;
  nullsNotDistinct = false;
  getName() {
    return this.name;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/pg-core/utils/array.js
function parsePgArrayValue(arrayString, startFrom, inQuotes) {
  for (let i = startFrom; i < arrayString.length; i++) {
    const char = arrayString[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (char === '"') {
      return [arrayString.slice(startFrom, i).replace(/\\/g, ""), i + 1];
    }
    if (inQuotes) {
      continue;
    }
    if (char === "," || char === "}") {
      return [arrayString.slice(startFrom, i).replace(/\\/g, ""), i];
    }
  }
  return [arrayString.slice(startFrom).replace(/\\/g, ""), arrayString.length];
}
__name(parsePgArrayValue, "parsePgArrayValue");
function parsePgNestedArray(arrayString, startFrom = 0) {
  const result = [];
  let i = startFrom;
  let lastCharIsComma = false;
  while (i < arrayString.length) {
    const char = arrayString[i];
    if (char === ",") {
      if (lastCharIsComma || i === startFrom) {
        result.push("");
      }
      lastCharIsComma = true;
      i++;
      continue;
    }
    lastCharIsComma = false;
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (char === '"') {
      const [value2, startFrom2] = parsePgArrayValue(arrayString, i + 1, true);
      result.push(value2);
      i = startFrom2;
      continue;
    }
    if (char === "}") {
      return [result, i + 1];
    }
    if (char === "{") {
      const [value2, startFrom2] = parsePgNestedArray(arrayString, i + 1);
      result.push(value2);
      i = startFrom2;
      continue;
    }
    const [value, newStartFrom] = parsePgArrayValue(arrayString, i, false);
    result.push(value);
    i = newStartFrom;
  }
  return [result, i];
}
__name(parsePgNestedArray, "parsePgNestedArray");
function parsePgArray(arrayString) {
  const [result] = parsePgNestedArray(arrayString, 1);
  return result;
}
__name(parsePgArray, "parsePgArray");
function makePgArray(array) {
  return `{${array.map((item) => {
    if (Array.isArray(item)) {
      return makePgArray(item);
    }
    if (typeof item === "string") {
      return `"${item.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return `${item}`;
  }).join(",")}}`;
}
__name(makePgArray, "makePgArray");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/pg-core/columns/common.js
var PgColumnBuilder = class extends ColumnBuilder {
  static {
    __name(this, "PgColumnBuilder");
  }
  foreignKeyConfigs = [];
  static [entityKind] = "PgColumnBuilder";
  array(size) {
    return new PgArrayBuilder(this.config.name, this, size);
  }
  references(ref, actions = {}) {
    this.foreignKeyConfigs.push({ ref, actions });
    return this;
  }
  unique(name, config) {
    this.config.isUnique = true;
    this.config.uniqueName = name;
    this.config.uniqueType = config?.nulls;
    return this;
  }
  generatedAlwaysAs(as) {
    this.config.generated = {
      as,
      type: "always",
      mode: "stored"
    };
    return this;
  }
  /** @internal */
  buildForeignKeys(column, table) {
    return this.foreignKeyConfigs.map(({ ref, actions }) => {
      return iife(
        (ref2, actions2) => {
          const builder = new ForeignKeyBuilder(() => {
            const foreignColumn = ref2();
            return { columns: [column], foreignColumns: [foreignColumn] };
          });
          if (actions2.onUpdate) {
            builder.onUpdate(actions2.onUpdate);
          }
          if (actions2.onDelete) {
            builder.onDelete(actions2.onDelete);
          }
          return builder.build(table);
        },
        ref,
        actions
      );
    });
  }
  /** @internal */
  buildExtraConfigColumn(table) {
    return new ExtraConfigColumn(table, this.config);
  }
};
var PgColumn = class extends Column {
  static {
    __name(this, "PgColumn");
  }
  constructor(table, config) {
    if (!config.uniqueName) {
      config.uniqueName = uniqueKeyName(table, [config.name]);
    }
    super(table, config);
    this.table = table;
  }
  static [entityKind] = "PgColumn";
};
var ExtraConfigColumn = class extends PgColumn {
  static {
    __name(this, "ExtraConfigColumn");
  }
  static [entityKind] = "ExtraConfigColumn";
  getSQLType() {
    return this.getSQLType();
  }
  indexConfig = {
    order: this.config.order ?? "asc",
    nulls: this.config.nulls ?? "last",
    opClass: this.config.opClass
  };
  defaultConfig = {
    order: "asc",
    nulls: "last",
    opClass: void 0
  };
  asc() {
    this.indexConfig.order = "asc";
    return this;
  }
  desc() {
    this.indexConfig.order = "desc";
    return this;
  }
  nullsFirst() {
    this.indexConfig.nulls = "first";
    return this;
  }
  nullsLast() {
    this.indexConfig.nulls = "last";
    return this;
  }
  /**
   * ### PostgreSQL documentation quote
   *
   * > An operator class with optional parameters can be specified for each column of an index.
   * The operator class identifies the operators to be used by the index for that column.
   * For example, a B-tree index on four-byte integers would use the int4_ops class;
   * this operator class includes comparison functions for four-byte integers.
   * In practice the default operator class for the column's data type is usually sufficient.
   * The main point of having operator classes is that for some data types, there could be more than one meaningful ordering.
   * For example, we might want to sort a complex-number data type either by absolute value or by real part.
   * We could do this by defining two operator classes for the data type and then selecting the proper class when creating an index.
   * More information about operator classes check:
   *
   * ### Useful links
   * https://www.postgresql.org/docs/current/sql-createindex.html
   *
   * https://www.postgresql.org/docs/current/indexes-opclass.html
   *
   * https://www.postgresql.org/docs/current/xindex.html
   *
   * ### Additional types
   * If you have the `pg_vector` extension installed in your database, you can use the
   * `vector_l2_ops`, `vector_ip_ops`, `vector_cosine_ops`, `vector_l1_ops`, `bit_hamming_ops`, `bit_jaccard_ops`, `halfvec_l2_ops`, `sparsevec_l2_ops` options, which are predefined types.
   *
   * **You can always specify any string you want in the operator class, in case Drizzle doesn't have it natively in its types**
   *
   * @param opClass
   * @returns
   */
  op(opClass) {
    this.indexConfig.opClass = opClass;
    return this;
  }
};
var IndexedColumn = class {
  static {
    __name(this, "IndexedColumn");
  }
  static [entityKind] = "IndexedColumn";
  constructor(name, keyAsName, type, indexConfig) {
    this.name = name;
    this.keyAsName = keyAsName;
    this.type = type;
    this.indexConfig = indexConfig;
  }
  name;
  keyAsName;
  type;
  indexConfig;
};
var PgArrayBuilder = class extends PgColumnBuilder {
  static {
    __name(this, "PgArrayBuilder");
  }
  static [entityKind] = "PgArrayBuilder";
  constructor(name, baseBuilder, size) {
    super(name, "array", "PgArray");
    this.config.baseBuilder = baseBuilder;
    this.config.size = size;
  }
  /** @internal */
  build(table) {
    const baseColumn = this.config.baseBuilder.build(table);
    return new PgArray(
      table,
      this.config,
      baseColumn
    );
  }
};
var PgArray = class _PgArray extends PgColumn {
  static {
    __name(this, "PgArray");
  }
  constructor(table, config, baseColumn, range) {
    super(table, config);
    this.baseColumn = baseColumn;
    this.range = range;
    this.size = config.size;
  }
  size;
  static [entityKind] = "PgArray";
  getSQLType() {
    return `${this.baseColumn.getSQLType()}[${typeof this.size === "number" ? this.size : ""}]`;
  }
  mapFromDriverValue(value) {
    if (typeof value === "string") {
      value = parsePgArray(value);
    }
    return value.map((v) => this.baseColumn.mapFromDriverValue(v));
  }
  mapToDriverValue(value, isNestedArray = false) {
    const a = value.map(
      (v) => v === null ? null : is(this.baseColumn, _PgArray) ? this.baseColumn.mapToDriverValue(v, true) : this.baseColumn.mapToDriverValue(v)
    );
    if (isNestedArray) return a;
    return makePgArray(a);
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/pg-core/columns/enum.js
var PgEnumObjectColumnBuilder = class extends PgColumnBuilder {
  static {
    __name(this, "PgEnumObjectColumnBuilder");
  }
  static [entityKind] = "PgEnumObjectColumnBuilder";
  constructor(name, enumInstance) {
    super(name, "string", "PgEnumObjectColumn");
    this.config.enum = enumInstance;
  }
  /** @internal */
  build(table) {
    return new PgEnumObjectColumn(
      table,
      this.config
    );
  }
};
var PgEnumObjectColumn = class extends PgColumn {
  static {
    __name(this, "PgEnumObjectColumn");
  }
  static [entityKind] = "PgEnumObjectColumn";
  enum;
  enumValues = this.config.enum.enumValues;
  constructor(table, config) {
    super(table, config);
    this.enum = config.enum;
  }
  getSQLType() {
    return this.enum.enumName;
  }
};
var isPgEnumSym = Symbol.for("drizzle:isPgEnum");
function isPgEnum(obj) {
  return !!obj && typeof obj === "function" && isPgEnumSym in obj && obj[isPgEnumSym] === true;
}
__name(isPgEnum, "isPgEnum");
var PgEnumColumnBuilder = class extends PgColumnBuilder {
  static {
    __name(this, "PgEnumColumnBuilder");
  }
  static [entityKind] = "PgEnumColumnBuilder";
  constructor(name, enumInstance) {
    super(name, "string", "PgEnumColumn");
    this.config.enum = enumInstance;
  }
  /** @internal */
  build(table) {
    return new PgEnumColumn(
      table,
      this.config
    );
  }
};
var PgEnumColumn = class extends PgColumn {
  static {
    __name(this, "PgEnumColumn");
  }
  static [entityKind] = "PgEnumColumn";
  enum = this.config.enum;
  enumValues = this.config.enum.enumValues;
  constructor(table, config) {
    super(table, config);
    this.enum = config.enum;
  }
  getSQLType() {
    return this.enum.enumName;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/subquery.js
var Subquery = class {
  static {
    __name(this, "Subquery");
  }
  static [entityKind] = "Subquery";
  constructor(sql2, fields, alias, isWith = false, usedTables = []) {
    this._ = {
      brand: "Subquery",
      sql: sql2,
      selectedFields: fields,
      alias,
      isWith,
      usedTables
    };
  }
  // getSQL(): SQL<unknown> {
  // 	return new SQL([this]);
  // }
};
var WithSubquery = class extends Subquery {
  static {
    __name(this, "WithSubquery");
  }
  static [entityKind] = "WithSubquery";
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/version.js
var version = "0.44.2";

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/tracing.js
var otel;
var rawTracer;
var tracer = {
  startActiveSpan(name, fn) {
    if (!otel) {
      return fn();
    }
    if (!rawTracer) {
      rawTracer = otel.trace.getTracer("drizzle-orm", version);
    }
    return iife(
      (otel2, rawTracer2) => rawTracer2.startActiveSpan(
        name,
        (span) => {
          try {
            return fn(span);
          } catch (e) {
            span.setStatus({
              code: otel2.SpanStatusCode.ERROR,
              message: e instanceof Error ? e.message : "Unknown error"
              // eslint-disable-line no-instanceof/no-instanceof
            });
            throw e;
          } finally {
            span.end();
          }
        }
      ),
      otel,
      rawTracer
    );
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/view-common.js
var ViewBaseConfig = Symbol.for("drizzle:ViewBaseConfig");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sql/sql.js
var FakePrimitiveParam = class {
  static {
    __name(this, "FakePrimitiveParam");
  }
  static [entityKind] = "FakePrimitiveParam";
};
function isSQLWrapper(value) {
  return value !== null && value !== void 0 && typeof value.getSQL === "function";
}
__name(isSQLWrapper, "isSQLWrapper");
function mergeQueries(queries) {
  const result = { sql: "", params: [] };
  for (const query of queries) {
    result.sql += query.sql;
    result.params.push(...query.params);
    if (query.typings?.length) {
      if (!result.typings) {
        result.typings = [];
      }
      result.typings.push(...query.typings);
    }
  }
  return result;
}
__name(mergeQueries, "mergeQueries");
var StringChunk = class {
  static {
    __name(this, "StringChunk");
  }
  static [entityKind] = "StringChunk";
  value;
  constructor(value) {
    this.value = Array.isArray(value) ? value : [value];
  }
  getSQL() {
    return new SQL([this]);
  }
};
var SQL = class _SQL {
  static {
    __name(this, "SQL");
  }
  constructor(queryChunks) {
    this.queryChunks = queryChunks;
    for (const chunk of queryChunks) {
      if (is(chunk, Table)) {
        const schemaName = chunk[Table.Symbol.Schema];
        this.usedTables.push(
          schemaName === void 0 ? chunk[Table.Symbol.Name] : schemaName + "." + chunk[Table.Symbol.Name]
        );
      }
    }
  }
  static [entityKind] = "SQL";
  /** @internal */
  decoder = noopDecoder;
  shouldInlineParams = false;
  /** @internal */
  usedTables = [];
  append(query) {
    this.queryChunks.push(...query.queryChunks);
    return this;
  }
  toQuery(config) {
    return tracer.startActiveSpan("drizzle.buildSQL", (span) => {
      const query = this.buildQueryFromSourceParams(this.queryChunks, config);
      span?.setAttributes({
        "drizzle.query.text": query.sql,
        "drizzle.query.params": JSON.stringify(query.params)
      });
      return query;
    });
  }
  buildQueryFromSourceParams(chunks, _config) {
    const config = Object.assign({}, _config, {
      inlineParams: _config.inlineParams || this.shouldInlineParams,
      paramStartIndex: _config.paramStartIndex || { value: 0 }
    });
    const {
      casing,
      escapeName,
      escapeParam,
      prepareTyping,
      inlineParams,
      paramStartIndex
    } = config;
    return mergeQueries(chunks.map((chunk) => {
      if (is(chunk, StringChunk)) {
        return { sql: chunk.value.join(""), params: [] };
      }
      if (is(chunk, Name)) {
        return { sql: escapeName(chunk.value), params: [] };
      }
      if (chunk === void 0) {
        return { sql: "", params: [] };
      }
      if (Array.isArray(chunk)) {
        const result = [new StringChunk("(")];
        for (const [i, p] of chunk.entries()) {
          result.push(p);
          if (i < chunk.length - 1) {
            result.push(new StringChunk(", "));
          }
        }
        result.push(new StringChunk(")"));
        return this.buildQueryFromSourceParams(result, config);
      }
      if (is(chunk, _SQL)) {
        return this.buildQueryFromSourceParams(chunk.queryChunks, {
          ...config,
          inlineParams: inlineParams || chunk.shouldInlineParams
        });
      }
      if (is(chunk, Table)) {
        const schemaName = chunk[Table.Symbol.Schema];
        const tableName = chunk[Table.Symbol.Name];
        return {
          sql: schemaName === void 0 || chunk[IsAlias] ? escapeName(tableName) : escapeName(schemaName) + "." + escapeName(tableName),
          params: []
        };
      }
      if (is(chunk, Column)) {
        const columnName = casing.getColumnCasing(chunk);
        if (_config.invokeSource === "indexes") {
          return { sql: escapeName(columnName), params: [] };
        }
        const schemaName = chunk.table[Table.Symbol.Schema];
        return {
          sql: chunk.table[IsAlias] || schemaName === void 0 ? escapeName(chunk.table[Table.Symbol.Name]) + "." + escapeName(columnName) : escapeName(schemaName) + "." + escapeName(chunk.table[Table.Symbol.Name]) + "." + escapeName(columnName),
          params: []
        };
      }
      if (is(chunk, View)) {
        const schemaName = chunk[ViewBaseConfig].schema;
        const viewName = chunk[ViewBaseConfig].name;
        return {
          sql: schemaName === void 0 || chunk[ViewBaseConfig].isAlias ? escapeName(viewName) : escapeName(schemaName) + "." + escapeName(viewName),
          params: []
        };
      }
      if (is(chunk, Param)) {
        if (is(chunk.value, Placeholder)) {
          return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
        }
        const mappedValue = chunk.value === null ? null : chunk.encoder.mapToDriverValue(chunk.value);
        if (is(mappedValue, _SQL)) {
          return this.buildQueryFromSourceParams([mappedValue], config);
        }
        if (inlineParams) {
          return { sql: this.mapInlineParam(mappedValue, config), params: [] };
        }
        let typings = ["none"];
        if (prepareTyping) {
          typings = [prepareTyping(chunk.encoder)];
        }
        return { sql: escapeParam(paramStartIndex.value++, mappedValue), params: [mappedValue], typings };
      }
      if (is(chunk, Placeholder)) {
        return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
      }
      if (is(chunk, _SQL.Aliased) && chunk.fieldAlias !== void 0) {
        return { sql: escapeName(chunk.fieldAlias), params: [] };
      }
      if (is(chunk, Subquery)) {
        if (chunk._.isWith) {
          return { sql: escapeName(chunk._.alias), params: [] };
        }
        return this.buildQueryFromSourceParams([
          new StringChunk("("),
          chunk._.sql,
          new StringChunk(") "),
          new Name(chunk._.alias)
        ], config);
      }
      if (isPgEnum(chunk)) {
        if (chunk.schema) {
          return { sql: escapeName(chunk.schema) + "." + escapeName(chunk.enumName), params: [] };
        }
        return { sql: escapeName(chunk.enumName), params: [] };
      }
      if (isSQLWrapper(chunk)) {
        if (chunk.shouldOmitSQLParens?.()) {
          return this.buildQueryFromSourceParams([chunk.getSQL()], config);
        }
        return this.buildQueryFromSourceParams([
          new StringChunk("("),
          chunk.getSQL(),
          new StringChunk(")")
        ], config);
      }
      if (inlineParams) {
        return { sql: this.mapInlineParam(chunk, config), params: [] };
      }
      return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
    }));
  }
  mapInlineParam(chunk, { escapeString }) {
    if (chunk === null) {
      return "null";
    }
    if (typeof chunk === "number" || typeof chunk === "boolean") {
      return chunk.toString();
    }
    if (typeof chunk === "string") {
      return escapeString(chunk);
    }
    if (typeof chunk === "object") {
      const mappedValueAsString = chunk.toString();
      if (mappedValueAsString === "[object Object]") {
        return escapeString(JSON.stringify(chunk));
      }
      return escapeString(mappedValueAsString);
    }
    throw new Error("Unexpected param value: " + chunk);
  }
  getSQL() {
    return this;
  }
  as(alias) {
    if (alias === void 0) {
      return this;
    }
    return new _SQL.Aliased(this, alias);
  }
  mapWith(decoder) {
    this.decoder = typeof decoder === "function" ? { mapFromDriverValue: decoder } : decoder;
    return this;
  }
  inlineParams() {
    this.shouldInlineParams = true;
    return this;
  }
  /**
   * This method is used to conditionally include a part of the query.
   *
   * @param condition - Condition to check
   * @returns itself if the condition is `true`, otherwise `undefined`
   */
  if(condition) {
    return condition ? this : void 0;
  }
};
var Name = class {
  static {
    __name(this, "Name");
  }
  constructor(value) {
    this.value = value;
  }
  static [entityKind] = "Name";
  brand;
  getSQL() {
    return new SQL([this]);
  }
};
function isDriverValueEncoder(value) {
  return typeof value === "object" && value !== null && "mapToDriverValue" in value && typeof value.mapToDriverValue === "function";
}
__name(isDriverValueEncoder, "isDriverValueEncoder");
var noopDecoder = {
  mapFromDriverValue: /* @__PURE__ */ __name((value) => value, "mapFromDriverValue")
};
var noopEncoder = {
  mapToDriverValue: /* @__PURE__ */ __name((value) => value, "mapToDriverValue")
};
var noopMapper = {
  ...noopDecoder,
  ...noopEncoder
};
var Param = class {
  static {
    __name(this, "Param");
  }
  /**
   * @param value - Parameter value
   * @param encoder - Encoder to convert the value to a driver parameter
   */
  constructor(value, encoder = noopEncoder) {
    this.value = value;
    this.encoder = encoder;
  }
  static [entityKind] = "Param";
  brand;
  getSQL() {
    return new SQL([this]);
  }
};
function sql(strings, ...params) {
  const queryChunks = [];
  if (params.length > 0 || strings.length > 0 && strings[0] !== "") {
    queryChunks.push(new StringChunk(strings[0]));
  }
  for (const [paramIndex, param2] of params.entries()) {
    queryChunks.push(param2, new StringChunk(strings[paramIndex + 1]));
  }
  return new SQL(queryChunks);
}
__name(sql, "sql");
((sql2) => {
  function empty() {
    return new SQL([]);
  }
  __name(empty, "empty");
  sql2.empty = empty;
  function fromList(list) {
    return new SQL(list);
  }
  __name(fromList, "fromList");
  sql2.fromList = fromList;
  function raw(str) {
    return new SQL([new StringChunk(str)]);
  }
  __name(raw, "raw");
  sql2.raw = raw;
  function join(chunks, separator) {
    const result = [];
    for (const [i, chunk] of chunks.entries()) {
      if (i > 0 && separator !== void 0) {
        result.push(separator);
      }
      result.push(chunk);
    }
    return new SQL(result);
  }
  __name(join, "join");
  sql2.join = join;
  function identifier(value) {
    return new Name(value);
  }
  __name(identifier, "identifier");
  sql2.identifier = identifier;
  function placeholder2(name2) {
    return new Placeholder(name2);
  }
  __name(placeholder2, "placeholder2");
  sql2.placeholder = placeholder2;
  function param2(value, encoder) {
    return new Param(value, encoder);
  }
  __name(param2, "param2");
  sql2.param = param2;
})(sql || (sql = {}));
((SQL2) => {
  class Aliased {
    static {
      __name(this, "Aliased");
    }
    constructor(sql2, fieldAlias) {
      this.sql = sql2;
      this.fieldAlias = fieldAlias;
    }
    static [entityKind] = "SQL.Aliased";
    /** @internal */
    isSelectionField = false;
    getSQL() {
      return this.sql;
    }
    /** @internal */
    clone() {
      return new Aliased(this.sql, this.fieldAlias);
    }
  }
  SQL2.Aliased = Aliased;
})(SQL || (SQL = {}));
var Placeholder = class {
  static {
    __name(this, "Placeholder");
  }
  constructor(name2) {
    this.name = name2;
  }
  static [entityKind] = "Placeholder";
  getSQL() {
    return new SQL([this]);
  }
};
function fillPlaceholders(params, values) {
  return params.map((p) => {
    if (is(p, Placeholder)) {
      if (!(p.name in values)) {
        throw new Error(`No value for placeholder "${p.name}" was provided`);
      }
      return values[p.name];
    }
    if (is(p, Param) && is(p.value, Placeholder)) {
      if (!(p.value.name in values)) {
        throw new Error(`No value for placeholder "${p.value.name}" was provided`);
      }
      return p.encoder.mapToDriverValue(values[p.value.name]);
    }
    return p;
  });
}
__name(fillPlaceholders, "fillPlaceholders");
var IsDrizzleView = Symbol.for("drizzle:IsDrizzleView");
var View = class {
  static {
    __name(this, "View");
  }
  static [entityKind] = "View";
  /** @internal */
  [ViewBaseConfig];
  /** @internal */
  [IsDrizzleView] = true;
  constructor({ name: name2, schema, selectedFields, query }) {
    this[ViewBaseConfig] = {
      name: name2,
      originalName: name2,
      schema,
      selectedFields,
      query,
      isExisting: !query,
      isAlias: false
    };
  }
  getSQL() {
    return new SQL([this]);
  }
};
Column.prototype.getSQL = function() {
  return new SQL([this]);
};
Table.prototype.getSQL = function() {
  return new SQL([this]);
};
Subquery.prototype.getSQL = function() {
  return new SQL([this]);
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/utils.js
function mapResultRow(columns, row, joinsNotNullableMap) {
  const nullifyMap = {};
  const result = columns.reduce(
    (result2, { path, field }, columnIndex) => {
      let decoder;
      if (is(field, Column)) {
        decoder = field;
      } else if (is(field, SQL)) {
        decoder = field.decoder;
      } else {
        decoder = field.sql.decoder;
      }
      let node = result2;
      for (const [pathChunkIndex, pathChunk] of path.entries()) {
        if (pathChunkIndex < path.length - 1) {
          if (!(pathChunk in node)) {
            node[pathChunk] = {};
          }
          node = node[pathChunk];
        } else {
          const rawValue = row[columnIndex];
          const value = node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
          if (joinsNotNullableMap && is(field, Column) && path.length === 2) {
            const objectName = path[0];
            if (!(objectName in nullifyMap)) {
              nullifyMap[objectName] = value === null ? getTableName(field.table) : false;
            } else if (typeof nullifyMap[objectName] === "string" && nullifyMap[objectName] !== getTableName(field.table)) {
              nullifyMap[objectName] = false;
            }
          }
        }
      }
      return result2;
    },
    {}
  );
  if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
    for (const [objectName, tableName] of Object.entries(nullifyMap)) {
      if (typeof tableName === "string" && !joinsNotNullableMap[tableName]) {
        result[objectName] = null;
      }
    }
  }
  return result;
}
__name(mapResultRow, "mapResultRow");
function orderSelectedFields(fields, pathPrefix) {
  return Object.entries(fields).reduce((result, [name, field]) => {
    if (typeof name !== "string") {
      return result;
    }
    const newPath = pathPrefix ? [...pathPrefix, name] : [name];
    if (is(field, Column) || is(field, SQL) || is(field, SQL.Aliased)) {
      result.push({ path: newPath, field });
    } else if (is(field, Table)) {
      result.push(...orderSelectedFields(field[Table.Symbol.Columns], newPath));
    } else {
      result.push(...orderSelectedFields(field, newPath));
    }
    return result;
  }, []);
}
__name(orderSelectedFields, "orderSelectedFields");
function haveSameKeys(left, right) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const [index2, key] of leftKeys.entries()) {
    if (key !== rightKeys[index2]) {
      return false;
    }
  }
  return true;
}
__name(haveSameKeys, "haveSameKeys");
function mapUpdateSet(table, values) {
  const entries = Object.entries(values).filter(([, value]) => value !== void 0).map(([key, value]) => {
    if (is(value, SQL) || is(value, Column)) {
      return [key, value];
    } else {
      return [key, new Param(value, table[Table.Symbol.Columns][key])];
    }
  });
  if (entries.length === 0) {
    throw new Error("No values to set");
  }
  return Object.fromEntries(entries);
}
__name(mapUpdateSet, "mapUpdateSet");
function applyMixins(baseClass, extendedClasses) {
  for (const extendedClass of extendedClasses) {
    for (const name of Object.getOwnPropertyNames(extendedClass.prototype)) {
      if (name === "constructor") continue;
      Object.defineProperty(
        baseClass.prototype,
        name,
        Object.getOwnPropertyDescriptor(extendedClass.prototype, name) || /* @__PURE__ */ Object.create(null)
      );
    }
  }
}
__name(applyMixins, "applyMixins");
function getTableColumns(table) {
  return table[Table.Symbol.Columns];
}
__name(getTableColumns, "getTableColumns");
function getTableLikeName(table) {
  return is(table, Subquery) ? table._.alias : is(table, View) ? table[ViewBaseConfig].name : is(table, SQL) ? void 0 : table[Table.Symbol.IsAlias] ? table[Table.Symbol.Name] : table[Table.Symbol.BaseName];
}
__name(getTableLikeName, "getTableLikeName");
function getColumnNameAndConfig(a, b) {
  return {
    name: typeof a === "string" && a.length > 0 ? a : "",
    config: typeof a === "object" ? a : b
  };
}
__name(getColumnNameAndConfig, "getColumnNameAndConfig");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/pg-core/table.js
var InlineForeignKeys = Symbol.for("drizzle:PgInlineForeignKeys");
var EnableRLS = Symbol.for("drizzle:EnableRLS");
var PgTable = class extends Table {
  static {
    __name(this, "PgTable");
  }
  static [entityKind] = "PgTable";
  /** @internal */
  static Symbol = Object.assign({}, Table.Symbol, {
    InlineForeignKeys,
    EnableRLS
  });
  /**@internal */
  [InlineForeignKeys] = [];
  /** @internal */
  [EnableRLS] = false;
  /** @internal */
  [Table.Symbol.ExtraConfigBuilder] = void 0;
  /** @internal */
  [Table.Symbol.ExtraConfigColumns] = {};
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/pg-core/primary-keys.js
var PrimaryKeyBuilder = class {
  static {
    __name(this, "PrimaryKeyBuilder");
  }
  static [entityKind] = "PgPrimaryKeyBuilder";
  /** @internal */
  columns;
  /** @internal */
  name;
  constructor(columns, name) {
    this.columns = columns;
    this.name = name;
  }
  /** @internal */
  build(table) {
    return new PrimaryKey(table, this.columns, this.name);
  }
};
var PrimaryKey = class {
  static {
    __name(this, "PrimaryKey");
  }
  constructor(table, columns, name) {
    this.table = table;
    this.columns = columns;
    this.name = name;
  }
  static [entityKind] = "PgPrimaryKey";
  columns;
  name;
  getName() {
    return this.name ?? `${this.table[PgTable.Symbol.Name]}_${this.columns.map((column) => column.name).join("_")}_pk`;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sql/expressions/conditions.js
function bindIfParam(value, column) {
  if (isDriverValueEncoder(column) && !isSQLWrapper(value) && !is(value, Param) && !is(value, Placeholder) && !is(value, Column) && !is(value, Table) && !is(value, View)) {
    return new Param(value, column);
  }
  return value;
}
__name(bindIfParam, "bindIfParam");
var eq = /* @__PURE__ */ __name((left, right) => {
  return sql`${left} = ${bindIfParam(right, left)}`;
}, "eq");
var ne = /* @__PURE__ */ __name((left, right) => {
  return sql`${left} <> ${bindIfParam(right, left)}`;
}, "ne");
function and(...unfilteredConditions) {
  const conditions = unfilteredConditions.filter(
    (c) => c !== void 0
  );
  if (conditions.length === 0) {
    return void 0;
  }
  if (conditions.length === 1) {
    return new SQL(conditions);
  }
  return new SQL([
    new StringChunk("("),
    sql.join(conditions, new StringChunk(" and ")),
    new StringChunk(")")
  ]);
}
__name(and, "and");
function or(...unfilteredConditions) {
  const conditions = unfilteredConditions.filter(
    (c) => c !== void 0
  );
  if (conditions.length === 0) {
    return void 0;
  }
  if (conditions.length === 1) {
    return new SQL(conditions);
  }
  return new SQL([
    new StringChunk("("),
    sql.join(conditions, new StringChunk(" or ")),
    new StringChunk(")")
  ]);
}
__name(or, "or");
function not(condition) {
  return sql`not ${condition}`;
}
__name(not, "not");
var gt = /* @__PURE__ */ __name((left, right) => {
  return sql`${left} > ${bindIfParam(right, left)}`;
}, "gt");
var gte = /* @__PURE__ */ __name((left, right) => {
  return sql`${left} >= ${bindIfParam(right, left)}`;
}, "gte");
var lt = /* @__PURE__ */ __name((left, right) => {
  return sql`${left} < ${bindIfParam(right, left)}`;
}, "lt");
var lte = /* @__PURE__ */ __name((left, right) => {
  return sql`${left} <= ${bindIfParam(right, left)}`;
}, "lte");
function inArray(column, values) {
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return sql`false`;
    }
    return sql`${column} in ${values.map((v) => bindIfParam(v, column))}`;
  }
  return sql`${column} in ${bindIfParam(values, column)}`;
}
__name(inArray, "inArray");
function notInArray(column, values) {
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return sql`true`;
    }
    return sql`${column} not in ${values.map((v) => bindIfParam(v, column))}`;
  }
  return sql`${column} not in ${bindIfParam(values, column)}`;
}
__name(notInArray, "notInArray");
function isNull(value) {
  return sql`${value} is null`;
}
__name(isNull, "isNull");
function isNotNull(value) {
  return sql`${value} is not null`;
}
__name(isNotNull, "isNotNull");
function exists(subquery) {
  return sql`exists ${subquery}`;
}
__name(exists, "exists");
function notExists(subquery) {
  return sql`not exists ${subquery}`;
}
__name(notExists, "notExists");
function between(column, min, max) {
  return sql`${column} between ${bindIfParam(min, column)} and ${bindIfParam(
    max,
    column
  )}`;
}
__name(between, "between");
function notBetween(column, min, max) {
  return sql`${column} not between ${bindIfParam(
    min,
    column
  )} and ${bindIfParam(max, column)}`;
}
__name(notBetween, "notBetween");
function like(column, value) {
  return sql`${column} like ${value}`;
}
__name(like, "like");
function notLike(column, value) {
  return sql`${column} not like ${value}`;
}
__name(notLike, "notLike");
function ilike(column, value) {
  return sql`${column} ilike ${value}`;
}
__name(ilike, "ilike");
function notIlike(column, value) {
  return sql`${column} not ilike ${value}`;
}
__name(notIlike, "notIlike");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sql/expressions/select.js
function asc(column) {
  return sql`${column} asc`;
}
__name(asc, "asc");
function desc(column) {
  return sql`${column} desc`;
}
__name(desc, "desc");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/relations.js
var Relation = class {
  static {
    __name(this, "Relation");
  }
  constructor(sourceTable, referencedTable, relationName) {
    this.sourceTable = sourceTable;
    this.referencedTable = referencedTable;
    this.relationName = relationName;
    this.referencedTableName = referencedTable[Table.Symbol.Name];
  }
  static [entityKind] = "Relation";
  referencedTableName;
  fieldName;
};
var Relations = class {
  static {
    __name(this, "Relations");
  }
  constructor(table, config) {
    this.table = table;
    this.config = config;
  }
  static [entityKind] = "Relations";
};
var One = class _One extends Relation {
  static {
    __name(this, "One");
  }
  constructor(sourceTable, referencedTable, config, isNullable) {
    super(sourceTable, referencedTable, config?.relationName);
    this.config = config;
    this.isNullable = isNullable;
  }
  static [entityKind] = "One";
  withFieldName(fieldName) {
    const relation = new _One(
      this.sourceTable,
      this.referencedTable,
      this.config,
      this.isNullable
    );
    relation.fieldName = fieldName;
    return relation;
  }
};
var Many = class _Many extends Relation {
  static {
    __name(this, "Many");
  }
  constructor(sourceTable, referencedTable, config) {
    super(sourceTable, referencedTable, config?.relationName);
    this.config = config;
  }
  static [entityKind] = "Many";
  withFieldName(fieldName) {
    const relation = new _Many(
      this.sourceTable,
      this.referencedTable,
      this.config
    );
    relation.fieldName = fieldName;
    return relation;
  }
};
function getOperators() {
  return {
    and,
    between,
    eq,
    exists,
    gt,
    gte,
    ilike,
    inArray,
    isNull,
    isNotNull,
    like,
    lt,
    lte,
    ne,
    not,
    notBetween,
    notExists,
    notLike,
    notIlike,
    notInArray,
    or,
    sql
  };
}
__name(getOperators, "getOperators");
function getOrderByOperators() {
  return {
    sql,
    asc,
    desc
  };
}
__name(getOrderByOperators, "getOrderByOperators");
function extractTablesRelationalConfig(schema, configHelpers) {
  if (Object.keys(schema).length === 1 && "default" in schema && !is(schema["default"], Table)) {
    schema = schema["default"];
  }
  const tableNamesMap = {};
  const relationsBuffer = {};
  const tablesConfig = {};
  for (const [key, value] of Object.entries(schema)) {
    if (is(value, Table)) {
      const dbName = getTableUniqueName(value);
      const bufferedRelations = relationsBuffer[dbName];
      tableNamesMap[dbName] = key;
      tablesConfig[key] = {
        tsName: key,
        dbName: value[Table.Symbol.Name],
        schema: value[Table.Symbol.Schema],
        columns: value[Table.Symbol.Columns],
        relations: bufferedRelations?.relations ?? {},
        primaryKey: bufferedRelations?.primaryKey ?? []
      };
      for (const column of Object.values(
        value[Table.Symbol.Columns]
      )) {
        if (column.primary) {
          tablesConfig[key].primaryKey.push(column);
        }
      }
      const extraConfig = value[Table.Symbol.ExtraConfigBuilder]?.(value[Table.Symbol.ExtraConfigColumns]);
      if (extraConfig) {
        for (const configEntry of Object.values(extraConfig)) {
          if (is(configEntry, PrimaryKeyBuilder)) {
            tablesConfig[key].primaryKey.push(...configEntry.columns);
          }
        }
      }
    } else if (is(value, Relations)) {
      const dbName = getTableUniqueName(value.table);
      const tableName = tableNamesMap[dbName];
      const relations2 = value.config(
        configHelpers(value.table)
      );
      let primaryKey;
      for (const [relationName, relation] of Object.entries(relations2)) {
        if (tableName) {
          const tableConfig = tablesConfig[tableName];
          tableConfig.relations[relationName] = relation;
          if (primaryKey) {
            tableConfig.primaryKey.push(...primaryKey);
          }
        } else {
          if (!(dbName in relationsBuffer)) {
            relationsBuffer[dbName] = {
              relations: {},
              primaryKey
            };
          }
          relationsBuffer[dbName].relations[relationName] = relation;
        }
      }
    }
  }
  return { tables: tablesConfig, tableNamesMap };
}
__name(extractTablesRelationalConfig, "extractTablesRelationalConfig");
function createOne(sourceTable) {
  return /* @__PURE__ */ __name(function one(table, config) {
    return new One(
      sourceTable,
      table,
      config,
      config?.fields.reduce((res, f) => res && f.notNull, true) ?? false
    );
  }, "one");
}
__name(createOne, "createOne");
function createMany(sourceTable) {
  return /* @__PURE__ */ __name(function many(referencedTable, config) {
    return new Many(sourceTable, referencedTable, config);
  }, "many");
}
__name(createMany, "createMany");
function normalizeRelation(schema, tableNamesMap, relation) {
  if (is(relation, One) && relation.config) {
    return {
      fields: relation.config.fields,
      references: relation.config.references
    };
  }
  const referencedTableTsName = tableNamesMap[getTableUniqueName(relation.referencedTable)];
  if (!referencedTableTsName) {
    throw new Error(
      `Table "${relation.referencedTable[Table.Symbol.Name]}" not found in schema`
    );
  }
  const referencedTableConfig = schema[referencedTableTsName];
  if (!referencedTableConfig) {
    throw new Error(`Table "${referencedTableTsName}" not found in schema`);
  }
  const sourceTable = relation.sourceTable;
  const sourceTableTsName = tableNamesMap[getTableUniqueName(sourceTable)];
  if (!sourceTableTsName) {
    throw new Error(
      `Table "${sourceTable[Table.Symbol.Name]}" not found in schema`
    );
  }
  const reverseRelations = [];
  for (const referencedTableRelation of Object.values(
    referencedTableConfig.relations
  )) {
    if (relation.relationName && relation !== referencedTableRelation && referencedTableRelation.relationName === relation.relationName || !relation.relationName && referencedTableRelation.referencedTable === relation.sourceTable) {
      reverseRelations.push(referencedTableRelation);
    }
  }
  if (reverseRelations.length > 1) {
    throw relation.relationName ? new Error(
      `There are multiple relations with name "${relation.relationName}" in table "${referencedTableTsName}"`
    ) : new Error(
      `There are multiple relations between "${referencedTableTsName}" and "${relation.sourceTable[Table.Symbol.Name]}". Please specify relation name`
    );
  }
  if (reverseRelations[0] && is(reverseRelations[0], One) && reverseRelations[0].config) {
    return {
      fields: reverseRelations[0].config.references,
      references: reverseRelations[0].config.fields
    };
  }
  throw new Error(
    `There is not enough information to infer relation "${sourceTableTsName}.${relation.fieldName}"`
  );
}
__name(normalizeRelation, "normalizeRelation");
function createTableRelationsHelpers(sourceTable) {
  return {
    one: createOne(sourceTable),
    many: createMany(sourceTable)
  };
}
__name(createTableRelationsHelpers, "createTableRelationsHelpers");
function mapRelationalRow(tablesConfig, tableConfig, row, buildQueryResultSelection, mapColumnValue = (value) => value) {
  const result = {};
  for (const [
    selectionItemIndex,
    selectionItem
  ] of buildQueryResultSelection.entries()) {
    if (selectionItem.isJson) {
      const relation = tableConfig.relations[selectionItem.tsKey];
      const rawSubRows = row[selectionItemIndex];
      const subRows = typeof rawSubRows === "string" ? JSON.parse(rawSubRows) : rawSubRows;
      result[selectionItem.tsKey] = is(relation, One) ? subRows && mapRelationalRow(
        tablesConfig,
        tablesConfig[selectionItem.relationTableTsKey],
        subRows,
        selectionItem.selection,
        mapColumnValue
      ) : subRows.map(
        (subRow) => mapRelationalRow(
          tablesConfig,
          tablesConfig[selectionItem.relationTableTsKey],
          subRow,
          selectionItem.selection,
          mapColumnValue
        )
      );
    } else {
      const value = mapColumnValue(row[selectionItemIndex]);
      const field = selectionItem.field;
      let decoder;
      if (is(field, Column)) {
        decoder = field;
      } else if (is(field, SQL)) {
        decoder = field.decoder;
      } else {
        decoder = field.sql.decoder;
      }
      result[selectionItem.tsKey] = value === null ? null : decoder.mapFromDriverValue(value);
    }
  }
  return result;
}
__name(mapRelationalRow, "mapRelationalRow");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/alias.js
var ColumnAliasProxyHandler = class {
  static {
    __name(this, "ColumnAliasProxyHandler");
  }
  constructor(table) {
    this.table = table;
  }
  static [entityKind] = "ColumnAliasProxyHandler";
  get(columnObj, prop) {
    if (prop === "table") {
      return this.table;
    }
    return columnObj[prop];
  }
};
var TableAliasProxyHandler = class {
  static {
    __name(this, "TableAliasProxyHandler");
  }
  constructor(alias, replaceOriginalName) {
    this.alias = alias;
    this.replaceOriginalName = replaceOriginalName;
  }
  static [entityKind] = "TableAliasProxyHandler";
  get(target, prop) {
    if (prop === Table.Symbol.IsAlias) {
      return true;
    }
    if (prop === Table.Symbol.Name) {
      return this.alias;
    }
    if (this.replaceOriginalName && prop === Table.Symbol.OriginalName) {
      return this.alias;
    }
    if (prop === ViewBaseConfig) {
      return {
        ...target[ViewBaseConfig],
        name: this.alias,
        isAlias: true
      };
    }
    if (prop === Table.Symbol.Columns) {
      const columns = target[Table.Symbol.Columns];
      if (!columns) {
        return columns;
      }
      const proxiedColumns = {};
      Object.keys(columns).map((key) => {
        proxiedColumns[key] = new Proxy(
          columns[key],
          new ColumnAliasProxyHandler(new Proxy(target, this))
        );
      });
      return proxiedColumns;
    }
    const value = target[prop];
    if (is(value, Column)) {
      return new Proxy(value, new ColumnAliasProxyHandler(new Proxy(target, this)));
    }
    return value;
  }
};
var RelationTableAliasProxyHandler = class {
  static {
    __name(this, "RelationTableAliasProxyHandler");
  }
  constructor(alias) {
    this.alias = alias;
  }
  static [entityKind] = "RelationTableAliasProxyHandler";
  get(target, prop) {
    if (prop === "sourceTable") {
      return aliasedTable(target.sourceTable, this.alias);
    }
    return target[prop];
  }
};
function aliasedTable(table, tableAlias) {
  return new Proxy(table, new TableAliasProxyHandler(tableAlias, false));
}
__name(aliasedTable, "aliasedTable");
function aliasedTableColumn(column, tableAlias) {
  return new Proxy(
    column,
    new ColumnAliasProxyHandler(new Proxy(column.table, new TableAliasProxyHandler(tableAlias, false)))
  );
}
__name(aliasedTableColumn, "aliasedTableColumn");
function mapColumnsInAliasedSQLToAlias(query, alias) {
  return new SQL.Aliased(mapColumnsInSQLToAlias(query.sql, alias), query.fieldAlias);
}
__name(mapColumnsInAliasedSQLToAlias, "mapColumnsInAliasedSQLToAlias");
function mapColumnsInSQLToAlias(query, alias) {
  return sql.join(query.queryChunks.map((c) => {
    if (is(c, Column)) {
      return aliasedTableColumn(c, alias);
    }
    if (is(c, SQL)) {
      return mapColumnsInSQLToAlias(c, alias);
    }
    if (is(c, SQL.Aliased)) {
      return mapColumnsInAliasedSQLToAlias(c, alias);
    }
    return c;
  }));
}
__name(mapColumnsInSQLToAlias, "mapColumnsInSQLToAlias");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/selection-proxy.js
var SelectionProxyHandler = class _SelectionProxyHandler {
  static {
    __name(this, "SelectionProxyHandler");
  }
  static [entityKind] = "SelectionProxyHandler";
  config;
  constructor(config) {
    this.config = { ...config };
  }
  get(subquery, prop) {
    if (prop === "_") {
      return {
        ...subquery["_"],
        selectedFields: new Proxy(
          subquery._.selectedFields,
          this
        )
      };
    }
    if (prop === ViewBaseConfig) {
      return {
        ...subquery[ViewBaseConfig],
        selectedFields: new Proxy(
          subquery[ViewBaseConfig].selectedFields,
          this
        )
      };
    }
    if (typeof prop === "symbol") {
      return subquery[prop];
    }
    const columns = is(subquery, Subquery) ? subquery._.selectedFields : is(subquery, View) ? subquery[ViewBaseConfig].selectedFields : subquery;
    const value = columns[prop];
    if (is(value, SQL.Aliased)) {
      if (this.config.sqlAliasedBehavior === "sql" && !value.isSelectionField) {
        return value.sql;
      }
      const newValue = value.clone();
      newValue.isSelectionField = true;
      return newValue;
    }
    if (is(value, SQL)) {
      if (this.config.sqlBehavior === "sql") {
        return value;
      }
      throw new Error(
        `You tried to reference "${prop}" field from a subquery, which is a raw SQL field, but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.`
      );
    }
    if (is(value, Column)) {
      if (this.config.alias) {
        return new Proxy(
          value,
          new ColumnAliasProxyHandler(
            new Proxy(
              value.table,
              new TableAliasProxyHandler(this.config.alias, this.config.replaceOriginalName ?? false)
            )
          )
        );
      }
      return value;
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    return new Proxy(value, new _SelectionProxyHandler(this.config));
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/query-promise.js
var QueryPromise = class {
  static {
    __name(this, "QueryPromise");
  }
  static [entityKind] = "QueryPromise";
  [Symbol.toStringTag] = "QueryPromise";
  catch(onRejected) {
    return this.then(void 0, onRejected);
  }
  finally(onFinally) {
    return this.then(
      (value) => {
        onFinally?.();
        return value;
      },
      (reason) => {
        onFinally?.();
        throw reason;
      }
    );
  }
  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/foreign-keys.js
var ForeignKeyBuilder2 = class {
  static {
    __name(this, "ForeignKeyBuilder");
  }
  static [entityKind] = "SQLiteForeignKeyBuilder";
  /** @internal */
  reference;
  /** @internal */
  _onUpdate;
  /** @internal */
  _onDelete;
  constructor(config, actions) {
    this.reference = () => {
      const { name, columns, foreignColumns } = config();
      return { name, columns, foreignTable: foreignColumns[0].table, foreignColumns };
    };
    if (actions) {
      this._onUpdate = actions.onUpdate;
      this._onDelete = actions.onDelete;
    }
  }
  onUpdate(action) {
    this._onUpdate = action;
    return this;
  }
  onDelete(action) {
    this._onDelete = action;
    return this;
  }
  /** @internal */
  build(table) {
    return new ForeignKey2(table, this);
  }
};
var ForeignKey2 = class {
  static {
    __name(this, "ForeignKey");
  }
  constructor(table, builder) {
    this.table = table;
    this.reference = builder.reference;
    this.onUpdate = builder._onUpdate;
    this.onDelete = builder._onDelete;
  }
  static [entityKind] = "SQLiteForeignKey";
  reference;
  onUpdate;
  onDelete;
  getName() {
    const { name, columns, foreignColumns } = this.reference();
    const columnNames = columns.map((column) => column.name);
    const foreignColumnNames = foreignColumns.map((column) => column.name);
    const chunks = [
      this.table[TableName],
      ...columnNames,
      foreignColumns[0].table[TableName],
      ...foreignColumnNames
    ];
    return name ?? `${chunks.join("_")}_fk`;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/unique-constraint.js
function uniqueKeyName2(table, columns) {
  return `${table[TableName]}_${columns.join("_")}_unique`;
}
__name(uniqueKeyName2, "uniqueKeyName");
var UniqueConstraintBuilder2 = class {
  static {
    __name(this, "UniqueConstraintBuilder");
  }
  constructor(columns, name) {
    this.name = name;
    this.columns = columns;
  }
  static [entityKind] = "SQLiteUniqueConstraintBuilder";
  /** @internal */
  columns;
  /** @internal */
  build(table) {
    return new UniqueConstraint2(table, this.columns, this.name);
  }
};
var UniqueOnConstraintBuilder2 = class {
  static {
    __name(this, "UniqueOnConstraintBuilder");
  }
  static [entityKind] = "SQLiteUniqueOnConstraintBuilder";
  /** @internal */
  name;
  constructor(name) {
    this.name = name;
  }
  on(...columns) {
    return new UniqueConstraintBuilder2(columns, this.name);
  }
};
var UniqueConstraint2 = class {
  static {
    __name(this, "UniqueConstraint");
  }
  constructor(table, columns, name) {
    this.table = table;
    this.columns = columns;
    this.name = name ?? uniqueKeyName2(this.table, this.columns.map((column) => column.name));
  }
  static [entityKind] = "SQLiteUniqueConstraint";
  columns;
  name;
  getName() {
    return this.name;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/columns/common.js
var SQLiteColumnBuilder = class extends ColumnBuilder {
  static {
    __name(this, "SQLiteColumnBuilder");
  }
  static [entityKind] = "SQLiteColumnBuilder";
  foreignKeyConfigs = [];
  references(ref, actions = {}) {
    this.foreignKeyConfigs.push({ ref, actions });
    return this;
  }
  unique(name) {
    this.config.isUnique = true;
    this.config.uniqueName = name;
    return this;
  }
  generatedAlwaysAs(as, config) {
    this.config.generated = {
      as,
      type: "always",
      mode: config?.mode ?? "virtual"
    };
    return this;
  }
  /** @internal */
  buildForeignKeys(column, table) {
    return this.foreignKeyConfigs.map(({ ref, actions }) => {
      return ((ref2, actions2) => {
        const builder = new ForeignKeyBuilder2(() => {
          const foreignColumn = ref2();
          return { columns: [column], foreignColumns: [foreignColumn] };
        });
        if (actions2.onUpdate) {
          builder.onUpdate(actions2.onUpdate);
        }
        if (actions2.onDelete) {
          builder.onDelete(actions2.onDelete);
        }
        return builder.build(table);
      })(ref, actions);
    });
  }
};
var SQLiteColumn = class extends Column {
  static {
    __name(this, "SQLiteColumn");
  }
  constructor(table, config) {
    if (!config.uniqueName) {
      config.uniqueName = uniqueKeyName2(table, [config.name]);
    }
    super(table, config);
    this.table = table;
  }
  static [entityKind] = "SQLiteColumn";
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/columns/blob.js
var SQLiteBigIntBuilder = class extends SQLiteColumnBuilder {
  static {
    __name(this, "SQLiteBigIntBuilder");
  }
  static [entityKind] = "SQLiteBigIntBuilder";
  constructor(name) {
    super(name, "bigint", "SQLiteBigInt");
  }
  /** @internal */
  build(table) {
    return new SQLiteBigInt(table, this.config);
  }
};
var SQLiteBigInt = class extends SQLiteColumn {
  static {
    __name(this, "SQLiteBigInt");
  }
  static [entityKind] = "SQLiteBigInt";
  getSQLType() {
    return "blob";
  }
  mapFromDriverValue(value) {
    if (Buffer.isBuffer(value)) {
      return BigInt(value.toString());
    }
    if (value instanceof ArrayBuffer) {
      const decoder = new TextDecoder();
      return BigInt(decoder.decode(value));
    }
    return BigInt(String.fromCodePoint(...value));
  }
  mapToDriverValue(value) {
    return Buffer.from(value.toString());
  }
};
var SQLiteBlobJsonBuilder = class extends SQLiteColumnBuilder {
  static {
    __name(this, "SQLiteBlobJsonBuilder");
  }
  static [entityKind] = "SQLiteBlobJsonBuilder";
  constructor(name) {
    super(name, "json", "SQLiteBlobJson");
  }
  /** @internal */
  build(table) {
    return new SQLiteBlobJson(
      table,
      this.config
    );
  }
};
var SQLiteBlobJson = class extends SQLiteColumn {
  static {
    __name(this, "SQLiteBlobJson");
  }
  static [entityKind] = "SQLiteBlobJson";
  getSQLType() {
    return "blob";
  }
  mapFromDriverValue(value) {
    if (Buffer.isBuffer(value)) {
      return JSON.parse(value.toString());
    }
    if (value instanceof ArrayBuffer) {
      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(value));
    }
    return JSON.parse(String.fromCodePoint(...value));
  }
  mapToDriverValue(value) {
    return Buffer.from(JSON.stringify(value));
  }
};
var SQLiteBlobBufferBuilder = class extends SQLiteColumnBuilder {
  static {
    __name(this, "SQLiteBlobBufferBuilder");
  }
  static [entityKind] = "SQLiteBlobBufferBuilder";
  constructor(name) {
    super(name, "buffer", "SQLiteBlobBuffer");
  }
  /** @internal */
  build(table) {
    return new SQLiteBlobBuffer(table, this.config);
  }
};
var SQLiteBlobBuffer = class extends SQLiteColumn {
  static {
    __name(this, "SQLiteBlobBuffer");
  }
  static [entityKind] = "SQLiteBlobBuffer";
  mapFromDriverValue(value) {
    if (Buffer.isBuffer(value)) {
      return value;
    }
    return Buffer.from(value);
  }
  getSQLType() {
    return "blob";
  }
};
function blob(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if (config?.mode === "json") {
    return new SQLiteBlobJsonBuilder(name);
  }
  if (config?.mode === "bigint") {
    return new SQLiteBigIntBuilder(name);
  }
  return new SQLiteBlobBufferBuilder(name);
}
__name(blob, "blob");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/columns/custom.js
var SQLiteCustomColumnBuilder = class extends SQLiteColumnBuilder {
  static {
    __name(this, "SQLiteCustomColumnBuilder");
  }
  static [entityKind] = "SQLiteCustomColumnBuilder";
  constructor(name, fieldConfig, customTypeParams) {
    super(name, "custom", "SQLiteCustomColumn");
    this.config.fieldConfig = fieldConfig;
    this.config.customTypeParams = customTypeParams;
  }
  /** @internal */
  build(table) {
    return new SQLiteCustomColumn(
      table,
      this.config
    );
  }
};
var SQLiteCustomColumn = class extends SQLiteColumn {
  static {
    __name(this, "SQLiteCustomColumn");
  }
  static [entityKind] = "SQLiteCustomColumn";
  sqlName;
  mapTo;
  mapFrom;
  constructor(table, config) {
    super(table, config);
    this.sqlName = config.customTypeParams.dataType(config.fieldConfig);
    this.mapTo = config.customTypeParams.toDriver;
    this.mapFrom = config.customTypeParams.fromDriver;
  }
  getSQLType() {
    return this.sqlName;
  }
  mapFromDriverValue(value) {
    return typeof this.mapFrom === "function" ? this.mapFrom(value) : value;
  }
  mapToDriverValue(value) {
    return typeof this.mapTo === "function" ? this.mapTo(value) : value;
  }
};
function customType(customTypeParams) {
  return (a, b) => {
    const { name, config } = getColumnNameAndConfig(a, b);
    return new SQLiteCustomColumnBuilder(
      name,
      config,
      customTypeParams
    );
  };
}
__name(customType, "customType");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/columns/integer.js
var SQLiteBaseIntegerBuilder = class extends SQLiteColumnBuilder {
  static {
    __name(this, "SQLiteBaseIntegerBuilder");
  }
  static [entityKind] = "SQLiteBaseIntegerBuilder";
  constructor(name, dataType, columnType) {
    super(name, dataType, columnType);
    this.config.autoIncrement = false;
  }
  primaryKey(config) {
    if (config?.autoIncrement) {
      this.config.autoIncrement = true;
    }
    this.config.hasDefault = true;
    return super.primaryKey();
  }
};
var SQLiteBaseInteger = class extends SQLiteColumn {
  static {
    __name(this, "SQLiteBaseInteger");
  }
  static [entityKind] = "SQLiteBaseInteger";
  autoIncrement = this.config.autoIncrement;
  getSQLType() {
    return "integer";
  }
};
var SQLiteIntegerBuilder = class extends SQLiteBaseIntegerBuilder {
  static {
    __name(this, "SQLiteIntegerBuilder");
  }
  static [entityKind] = "SQLiteIntegerBuilder";
  constructor(name) {
    super(name, "number", "SQLiteInteger");
  }
  build(table) {
    return new SQLiteInteger(
      table,
      this.config
    );
  }
};
var SQLiteInteger = class extends SQLiteBaseInteger {
  static {
    __name(this, "SQLiteInteger");
  }
  static [entityKind] = "SQLiteInteger";
};
var SQLiteTimestampBuilder = class extends SQLiteBaseIntegerBuilder {
  static {
    __name(this, "SQLiteTimestampBuilder");
  }
  static [entityKind] = "SQLiteTimestampBuilder";
  constructor(name, mode) {
    super(name, "date", "SQLiteTimestamp");
    this.config.mode = mode;
  }
  /**
   * @deprecated Use `default()` with your own expression instead.
   *
   * Adds `DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))` to the column, which is the current epoch timestamp in milliseconds.
   */
  defaultNow() {
    return this.default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`);
  }
  build(table) {
    return new SQLiteTimestamp(
      table,
      this.config
    );
  }
};
var SQLiteTimestamp = class extends SQLiteBaseInteger {
  static {
    __name(this, "SQLiteTimestamp");
  }
  static [entityKind] = "SQLiteTimestamp";
  mode = this.config.mode;
  mapFromDriverValue(value) {
    if (this.config.mode === "timestamp") {
      return new Date(value * 1e3);
    }
    return new Date(value);
  }
  mapToDriverValue(value) {
    const unix = value.getTime();
    if (this.config.mode === "timestamp") {
      return Math.floor(unix / 1e3);
    }
    return unix;
  }
};
var SQLiteBooleanBuilder = class extends SQLiteBaseIntegerBuilder {
  static {
    __name(this, "SQLiteBooleanBuilder");
  }
  static [entityKind] = "SQLiteBooleanBuilder";
  constructor(name, mode) {
    super(name, "boolean", "SQLiteBoolean");
    this.config.mode = mode;
  }
  build(table) {
    return new SQLiteBoolean(
      table,
      this.config
    );
  }
};
var SQLiteBoolean = class extends SQLiteBaseInteger {
  static {
    __name(this, "SQLiteBoolean");
  }
  static [entityKind] = "SQLiteBoolean";
  mode = this.config.mode;
  mapFromDriverValue(value) {
    return Number(value) === 1;
  }
  mapToDriverValue(value) {
    return value ? 1 : 0;
  }
};
function integer(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if (config?.mode === "timestamp" || config?.mode === "timestamp_ms") {
    return new SQLiteTimestampBuilder(name, config.mode);
  }
  if (config?.mode === "boolean") {
    return new SQLiteBooleanBuilder(name, config.mode);
  }
  return new SQLiteIntegerBuilder(name);
}
__name(integer, "integer");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/columns/numeric.js
var SQLiteNumericBuilder = class extends SQLiteColumnBuilder {
  static {
    __name(this, "SQLiteNumericBuilder");
  }
  static [entityKind] = "SQLiteNumericBuilder";
  constructor(name) {
    super(name, "string", "SQLiteNumeric");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumeric(
      table,
      this.config
    );
  }
};
var SQLiteNumeric = class extends SQLiteColumn {
  static {
    __name(this, "SQLiteNumeric");
  }
  static [entityKind] = "SQLiteNumeric";
  mapFromDriverValue(value) {
    if (typeof value === "string") return value;
    return String(value);
  }
  getSQLType() {
    return "numeric";
  }
};
var SQLiteNumericNumberBuilder = class extends SQLiteColumnBuilder {
  static {
    __name(this, "SQLiteNumericNumberBuilder");
  }
  static [entityKind] = "SQLiteNumericNumberBuilder";
  constructor(name) {
    super(name, "number", "SQLiteNumericNumber");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumericNumber(
      table,
      this.config
    );
  }
};
var SQLiteNumericNumber = class extends SQLiteColumn {
  static {
    __name(this, "SQLiteNumericNumber");
  }
  static [entityKind] = "SQLiteNumericNumber";
  mapFromDriverValue(value) {
    if (typeof value === "number") return value;
    return Number(value);
  }
  mapToDriverValue = String;
  getSQLType() {
    return "numeric";
  }
};
var SQLiteNumericBigIntBuilder = class extends SQLiteColumnBuilder {
  static {
    __name(this, "SQLiteNumericBigIntBuilder");
  }
  static [entityKind] = "SQLiteNumericBigIntBuilder";
  constructor(name) {
    super(name, "bigint", "SQLiteNumericBigInt");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumericBigInt(
      table,
      this.config
    );
  }
};
var SQLiteNumericBigInt = class extends SQLiteColumn {
  static {
    __name(this, "SQLiteNumericBigInt");
  }
  static [entityKind] = "SQLiteNumericBigInt";
  mapFromDriverValue = BigInt;
  mapToDriverValue = String;
  getSQLType() {
    return "numeric";
  }
};
function numeric(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  const mode = config?.mode;
  return mode === "number" ? new SQLiteNumericNumberBuilder(name) : mode === "bigint" ? new SQLiteNumericBigIntBuilder(name) : new SQLiteNumericBuilder(name);
}
__name(numeric, "numeric");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/columns/real.js
var SQLiteRealBuilder = class extends SQLiteColumnBuilder {
  static {
    __name(this, "SQLiteRealBuilder");
  }
  static [entityKind] = "SQLiteRealBuilder";
  constructor(name) {
    super(name, "number", "SQLiteReal");
  }
  /** @internal */
  build(table) {
    return new SQLiteReal(table, this.config);
  }
};
var SQLiteReal = class extends SQLiteColumn {
  static {
    __name(this, "SQLiteReal");
  }
  static [entityKind] = "SQLiteReal";
  getSQLType() {
    return "real";
  }
};
function real(name) {
  return new SQLiteRealBuilder(name ?? "");
}
__name(real, "real");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/columns/text.js
var SQLiteTextBuilder = class extends SQLiteColumnBuilder {
  static {
    __name(this, "SQLiteTextBuilder");
  }
  static [entityKind] = "SQLiteTextBuilder";
  constructor(name, config) {
    super(name, "string", "SQLiteText");
    this.config.enumValues = config.enum;
    this.config.length = config.length;
  }
  /** @internal */
  build(table) {
    return new SQLiteText(
      table,
      this.config
    );
  }
};
var SQLiteText = class extends SQLiteColumn {
  static {
    __name(this, "SQLiteText");
  }
  static [entityKind] = "SQLiteText";
  enumValues = this.config.enumValues;
  length = this.config.length;
  constructor(table, config) {
    super(table, config);
  }
  getSQLType() {
    return `text${this.config.length ? `(${this.config.length})` : ""}`;
  }
};
var SQLiteTextJsonBuilder = class extends SQLiteColumnBuilder {
  static {
    __name(this, "SQLiteTextJsonBuilder");
  }
  static [entityKind] = "SQLiteTextJsonBuilder";
  constructor(name) {
    super(name, "json", "SQLiteTextJson");
  }
  /** @internal */
  build(table) {
    return new SQLiteTextJson(
      table,
      this.config
    );
  }
};
var SQLiteTextJson = class extends SQLiteColumn {
  static {
    __name(this, "SQLiteTextJson");
  }
  static [entityKind] = "SQLiteTextJson";
  getSQLType() {
    return "text";
  }
  mapFromDriverValue(value) {
    return JSON.parse(value);
  }
  mapToDriverValue(value) {
    return JSON.stringify(value);
  }
};
function text(a, b = {}) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if (config.mode === "json") {
    return new SQLiteTextJsonBuilder(name);
  }
  return new SQLiteTextBuilder(name, config);
}
__name(text, "text");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/columns/all.js
function getSQLiteColumnBuilders() {
  return {
    blob,
    customType,
    integer,
    numeric,
    real,
    text
  };
}
__name(getSQLiteColumnBuilders, "getSQLiteColumnBuilders");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/table.js
var InlineForeignKeys2 = Symbol.for("drizzle:SQLiteInlineForeignKeys");
var SQLiteTable = class extends Table {
  static {
    __name(this, "SQLiteTable");
  }
  static [entityKind] = "SQLiteTable";
  /** @internal */
  static Symbol = Object.assign({}, Table.Symbol, {
    InlineForeignKeys: InlineForeignKeys2
  });
  /** @internal */
  [Table.Symbol.Columns];
  /** @internal */
  [InlineForeignKeys2] = [];
  /** @internal */
  [Table.Symbol.ExtraConfigBuilder] = void 0;
};
function sqliteTableBase(name, columns, extraConfig, schema, baseName = name) {
  const rawTable = new SQLiteTable(name, schema, baseName);
  const parsedColumns = typeof columns === "function" ? columns(getSQLiteColumnBuilders()) : columns;
  const builtColumns = Object.fromEntries(
    Object.entries(parsedColumns).map(([name2, colBuilderBase]) => {
      const colBuilder = colBuilderBase;
      colBuilder.setName(name2);
      const column = colBuilder.build(rawTable);
      rawTable[InlineForeignKeys2].push(...colBuilder.buildForeignKeys(column, rawTable));
      return [name2, column];
    })
  );
  const table = Object.assign(rawTable, builtColumns);
  table[Table.Symbol.Columns] = builtColumns;
  table[Table.Symbol.ExtraConfigColumns] = builtColumns;
  if (extraConfig) {
    table[SQLiteTable.Symbol.ExtraConfigBuilder] = extraConfig;
  }
  return table;
}
__name(sqliteTableBase, "sqliteTableBase");
var sqliteTable = /* @__PURE__ */ __name((name, columns, extraConfig) => {
  return sqliteTableBase(name, columns, extraConfig);
}, "sqliteTable");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/indexes.js
var IndexBuilderOn = class {
  static {
    __name(this, "IndexBuilderOn");
  }
  constructor(name, unique) {
    this.name = name;
    this.unique = unique;
  }
  static [entityKind] = "SQLiteIndexBuilderOn";
  on(...columns) {
    return new IndexBuilder(this.name, columns, this.unique);
  }
};
var IndexBuilder = class {
  static {
    __name(this, "IndexBuilder");
  }
  static [entityKind] = "SQLiteIndexBuilder";
  /** @internal */
  config;
  constructor(name, columns, unique) {
    this.config = {
      name,
      columns,
      unique,
      where: void 0
    };
  }
  /**
   * Condition for partial index.
   */
  where(condition) {
    this.config.where = condition;
    return this;
  }
  /** @internal */
  build(table) {
    return new Index(this.config, table);
  }
};
var Index = class {
  static {
    __name(this, "Index");
  }
  static [entityKind] = "SQLiteIndex";
  config;
  constructor(config, table) {
    this.config = { ...config, table };
  }
};
function index(name) {
  return new IndexBuilderOn(name, false);
}
__name(index, "index");
function uniqueIndex(name) {
  return new IndexBuilderOn(name, true);
}
__name(uniqueIndex, "uniqueIndex");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/utils.js
function extractUsedTable(table) {
  if (is(table, SQLiteTable)) {
    return [`${table[Table.Symbol.BaseName]}`];
  }
  if (is(table, Subquery)) {
    return table._.usedTables ?? [];
  }
  if (is(table, SQL)) {
    return table.usedTables ?? [];
  }
  return [];
}
__name(extractUsedTable, "extractUsedTable");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/query-builders/delete.js
var SQLiteDeleteBase = class extends QueryPromise {
  static {
    __name(this, "SQLiteDeleteBase");
  }
  constructor(table, session, dialect, withList) {
    super();
    this.table = table;
    this.session = session;
    this.dialect = dialect;
    this.config = { table, withList };
  }
  static [entityKind] = "SQLiteDelete";
  /** @internal */
  config;
  /**
   * Adds a `where` clause to the query.
   *
   * Calling this method will delete only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/delete}
   *
   * @param where the `where` clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be deleted.
   *
   * ```ts
   * // Delete all cars with green color
   * db.delete(cars).where(eq(cars.color, 'green'));
   * // or
   * db.delete(cars).where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Delete all BMW cars with a green color
   * db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Delete all cars with the green or blue color
   * db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(where) {
    this.config.where = where;
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.table[Table.Symbol.Columns],
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      this.config.orderBy = orderByArray;
    } else {
      const orderByArray = columns;
      this.config.orderBy = orderByArray;
    }
    return this;
  }
  limit(limit) {
    this.config.limit = limit;
    return this;
  }
  returning(fields = this.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildDeleteQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "delete",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  run = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().run(placeholderValues);
  }, "run");
  all = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().all(placeholderValues);
  }, "all");
  get = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().get(placeholderValues);
  }, "get");
  values = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().values(placeholderValues);
  }, "values");
  async execute(placeholderValues) {
    return this._prepare().execute(placeholderValues);
  }
  $dynamic() {
    return this;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/casing.js
function toSnakeCase(input) {
  const words = input.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];
  return words.map((word) => word.toLowerCase()).join("_");
}
__name(toSnakeCase, "toSnakeCase");
function toCamelCase(input) {
  const words = input.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];
  return words.reduce((acc, word, i) => {
    const formattedWord = i === 0 ? word.toLowerCase() : `${word[0].toUpperCase()}${word.slice(1)}`;
    return acc + formattedWord;
  }, "");
}
__name(toCamelCase, "toCamelCase");
function noopCase(input) {
  return input;
}
__name(noopCase, "noopCase");
var CasingCache = class {
  static {
    __name(this, "CasingCache");
  }
  static [entityKind] = "CasingCache";
  /** @internal */
  cache = {};
  cachedTables = {};
  convert;
  constructor(casing) {
    this.convert = casing === "snake_case" ? toSnakeCase : casing === "camelCase" ? toCamelCase : noopCase;
  }
  getColumnCasing(column) {
    if (!column.keyAsName) return column.name;
    const schema = column.table[Table.Symbol.Schema] ?? "public";
    const tableName = column.table[Table.Symbol.OriginalName];
    const key = `${schema}.${tableName}.${column.name}`;
    if (!this.cache[key]) {
      this.cacheTable(column.table);
    }
    return this.cache[key];
  }
  cacheTable(table) {
    const schema = table[Table.Symbol.Schema] ?? "public";
    const tableName = table[Table.Symbol.OriginalName];
    const tableKey = `${schema}.${tableName}`;
    if (!this.cachedTables[tableKey]) {
      for (const column of Object.values(table[Table.Symbol.Columns])) {
        const columnKey = `${tableKey}.${column.name}`;
        this.cache[columnKey] = this.convert(column.name);
      }
      this.cachedTables[tableKey] = true;
    }
  }
  clearCache() {
    this.cache = {};
    this.cachedTables = {};
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/errors.js
var DrizzleError = class extends Error {
  static {
    __name(this, "DrizzleError");
  }
  static [entityKind] = "DrizzleError";
  constructor({ message, cause }) {
    super(message);
    this.name = "DrizzleError";
    this.cause = cause;
  }
};
var TransactionRollbackError = class extends DrizzleError {
  static {
    __name(this, "TransactionRollbackError");
  }
  static [entityKind] = "TransactionRollbackError";
  constructor() {
    super({ message: "Rollback" });
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sql/functions/aggregate.js
function count(expression) {
  return sql`count(${expression || sql.raw("*")})`.mapWith(Number);
}
__name(count, "count");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/view-base.js
var SQLiteViewBase = class extends View {
  static {
    __name(this, "SQLiteViewBase");
  }
  static [entityKind] = "SQLiteViewBase";
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/dialect.js
var SQLiteDialect = class {
  static {
    __name(this, "SQLiteDialect");
  }
  static [entityKind] = "SQLiteDialect";
  /** @internal */
  casing;
  constructor(config) {
    this.casing = new CasingCache(config?.casing);
  }
  escapeName(name) {
    return `"${name}"`;
  }
  escapeParam(_num) {
    return "?";
  }
  escapeString(str) {
    return `'${str.replace(/'/g, "''")}'`;
  }
  buildWithCTE(queries) {
    if (!queries?.length) return void 0;
    const withSqlChunks = [sql`with `];
    for (const [i, w] of queries.entries()) {
      withSqlChunks.push(sql`${sql.identifier(w._.alias)} as (${w._.sql})`);
      if (i < queries.length - 1) {
        withSqlChunks.push(sql`, `);
      }
    }
    withSqlChunks.push(sql` `);
    return sql.join(withSqlChunks);
  }
  buildDeleteQuery({ table, where, returning, withList, limit, orderBy }) {
    const withSql = this.buildWithCTE(withList);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const whereSql = where ? sql` where ${where}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    return sql`${withSql}delete from ${table}${whereSql}${returningSql}${orderBySql}${limitSql}`;
  }
  buildUpdateSet(table, set) {
    const tableColumns = table[Table.Symbol.Columns];
    const columnNames = Object.keys(tableColumns).filter(
      (colName) => set[colName] !== void 0 || tableColumns[colName]?.onUpdateFn !== void 0
    );
    const setSize = columnNames.length;
    return sql.join(columnNames.flatMap((colName, i) => {
      const col = tableColumns[colName];
      const value = set[colName] ?? sql.param(col.onUpdateFn(), col);
      const res = sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`;
      if (i < setSize - 1) {
        return [res, sql.raw(", ")];
      }
      return [res];
    }));
  }
  buildUpdateQuery({ table, set, where, returning, withList, joins, from, limit, orderBy }) {
    const withSql = this.buildWithCTE(withList);
    const setSql = this.buildUpdateSet(table, set);
    const fromSql = from && sql.join([sql.raw(" from "), this.buildFromTable(from)]);
    const joinsSql = this.buildJoins(joins);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const whereSql = where ? sql` where ${where}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    return sql`${withSql}update ${table} set ${setSql}${fromSql}${joinsSql}${whereSql}${returningSql}${orderBySql}${limitSql}`;
  }
  /**
   * Builds selection SQL with provided fields/expressions
   *
   * Examples:
   *
   * `select <selection> from`
   *
   * `insert ... returning <selection>`
   *
   * If `isSingleTable` is true, then columns won't be prefixed with table name
   */
  buildSelection(fields, { isSingleTable = false } = {}) {
    const columnsLen = fields.length;
    const chunks = fields.flatMap(({ field }, i) => {
      const chunk = [];
      if (is(field, SQL.Aliased) && field.isSelectionField) {
        chunk.push(sql.identifier(field.fieldAlias));
      } else if (is(field, SQL.Aliased) || is(field, SQL)) {
        const query = is(field, SQL.Aliased) ? field.sql : field;
        if (isSingleTable) {
          chunk.push(
            new SQL(
              query.queryChunks.map((c) => {
                if (is(c, Column)) {
                  return sql.identifier(this.casing.getColumnCasing(c));
                }
                return c;
              })
            )
          );
        } else {
          chunk.push(query);
        }
        if (is(field, SQL.Aliased)) {
          chunk.push(sql` as ${sql.identifier(field.fieldAlias)}`);
        }
      } else if (is(field, Column)) {
        const tableName = field.table[Table.Symbol.Name];
        if (field.columnType === "SQLiteNumericBigInt") {
          if (isSingleTable) {
            chunk.push(sql`cast(${sql.identifier(this.casing.getColumnCasing(field))} as text)`);
          } else {
            chunk.push(
              sql`cast(${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))} as text)`
            );
          }
        } else {
          if (isSingleTable) {
            chunk.push(sql.identifier(this.casing.getColumnCasing(field)));
          } else {
            chunk.push(sql`${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))}`);
          }
        }
      }
      if (i < columnsLen - 1) {
        chunk.push(sql`, `);
      }
      return chunk;
    });
    return sql.join(chunks);
  }
  buildJoins(joins) {
    if (!joins || joins.length === 0) {
      return void 0;
    }
    const joinsArray = [];
    if (joins) {
      for (const [index2, joinMeta] of joins.entries()) {
        if (index2 === 0) {
          joinsArray.push(sql` `);
        }
        const table = joinMeta.table;
        const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : void 0;
        if (is(table, SQLiteTable)) {
          const tableName = table[SQLiteTable.Symbol.Name];
          const tableSchema = table[SQLiteTable.Symbol.Schema];
          const origTableName = table[SQLiteTable.Symbol.OriginalName];
          const alias = tableName === origTableName ? void 0 : joinMeta.alias;
          joinsArray.push(
            sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? sql`${sql.identifier(tableSchema)}.` : void 0}${sql.identifier(origTableName)}${alias && sql` ${sql.identifier(alias)}`}${onSql}`
          );
        } else {
          joinsArray.push(
            sql`${sql.raw(joinMeta.joinType)} join ${table}${onSql}`
          );
        }
        if (index2 < joins.length - 1) {
          joinsArray.push(sql` `);
        }
      }
    }
    return sql.join(joinsArray);
  }
  buildLimit(limit) {
    return typeof limit === "object" || typeof limit === "number" && limit >= 0 ? sql` limit ${limit}` : void 0;
  }
  buildOrderBy(orderBy) {
    const orderByList = [];
    if (orderBy) {
      for (const [index2, orderByValue] of orderBy.entries()) {
        orderByList.push(orderByValue);
        if (index2 < orderBy.length - 1) {
          orderByList.push(sql`, `);
        }
      }
    }
    return orderByList.length > 0 ? sql` order by ${sql.join(orderByList)}` : void 0;
  }
  buildFromTable(table) {
    if (is(table, Table) && table[Table.Symbol.IsAlias]) {
      return sql`${sql`${sql.identifier(table[Table.Symbol.Schema] ?? "")}.`.if(table[Table.Symbol.Schema])}${sql.identifier(table[Table.Symbol.OriginalName])} ${sql.identifier(table[Table.Symbol.Name])}`;
    }
    return table;
  }
  buildSelectQuery({
    withList,
    fields,
    fieldsFlat,
    where,
    having,
    table,
    joins,
    orderBy,
    groupBy,
    limit,
    offset,
    distinct,
    setOperators
  }) {
    const fieldsList = fieldsFlat ?? orderSelectedFields(fields);
    for (const f of fieldsList) {
      if (is(f.field, Column) && getTableName(f.field.table) !== (is(table, Subquery) ? table._.alias : is(table, SQLiteViewBase) ? table[ViewBaseConfig].name : is(table, SQL) ? void 0 : getTableName(table)) && !((table2) => joins?.some(
        ({ alias }) => alias === (table2[Table.Symbol.IsAlias] ? getTableName(table2) : table2[Table.Symbol.BaseName])
      ))(f.field.table)) {
        const tableName = getTableName(f.field.table);
        throw new Error(
          `Your "${f.path.join("->")}" field references a column "${tableName}"."${f.field.name}", but the table "${tableName}" is not part of the query! Did you forget to join it?`
        );
      }
    }
    const isSingleTable = !joins || joins.length === 0;
    const withSql = this.buildWithCTE(withList);
    const distinctSql = distinct ? sql` distinct` : void 0;
    const selection = this.buildSelection(fieldsList, { isSingleTable });
    const tableSql = this.buildFromTable(table);
    const joinsSql = this.buildJoins(joins);
    const whereSql = where ? sql` where ${where}` : void 0;
    const havingSql = having ? sql` having ${having}` : void 0;
    const groupByList = [];
    if (groupBy) {
      for (const [index2, groupByValue] of groupBy.entries()) {
        groupByList.push(groupByValue);
        if (index2 < groupBy.length - 1) {
          groupByList.push(sql`, `);
        }
      }
    }
    const groupBySql = groupByList.length > 0 ? sql` group by ${sql.join(groupByList)}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    const offsetSql = offset ? sql` offset ${offset}` : void 0;
    const finalQuery = sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}`;
    if (setOperators.length > 0) {
      return this.buildSetOperations(finalQuery, setOperators);
    }
    return finalQuery;
  }
  buildSetOperations(leftSelect, setOperators) {
    const [setOperator, ...rest] = setOperators;
    if (!setOperator) {
      throw new Error("Cannot pass undefined values to any set operator");
    }
    if (rest.length === 0) {
      return this.buildSetOperationQuery({ leftSelect, setOperator });
    }
    return this.buildSetOperations(
      this.buildSetOperationQuery({ leftSelect, setOperator }),
      rest
    );
  }
  buildSetOperationQuery({
    leftSelect,
    setOperator: { type, isAll, rightSelect, limit, orderBy, offset }
  }) {
    const leftChunk = sql`${leftSelect.getSQL()} `;
    const rightChunk = sql`${rightSelect.getSQL()}`;
    let orderBySql;
    if (orderBy && orderBy.length > 0) {
      const orderByValues = [];
      for (const singleOrderBy of orderBy) {
        if (is(singleOrderBy, SQLiteColumn)) {
          orderByValues.push(sql.identifier(singleOrderBy.name));
        } else if (is(singleOrderBy, SQL)) {
          for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
            const chunk = singleOrderBy.queryChunks[i];
            if (is(chunk, SQLiteColumn)) {
              singleOrderBy.queryChunks[i] = sql.identifier(this.casing.getColumnCasing(chunk));
            }
          }
          orderByValues.push(sql`${singleOrderBy}`);
        } else {
          orderByValues.push(sql`${singleOrderBy}`);
        }
      }
      orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)}`;
    }
    const limitSql = typeof limit === "object" || typeof limit === "number" && limit >= 0 ? sql` limit ${limit}` : void 0;
    const operatorChunk = sql.raw(`${type} ${isAll ? "all " : ""}`);
    const offsetSql = offset ? sql` offset ${offset}` : void 0;
    return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
  }
  buildInsertQuery({ table, values: valuesOrSelect, onConflict, returning, withList, select }) {
    const valuesSqlList = [];
    const columns = table[Table.Symbol.Columns];
    const colEntries = Object.entries(columns).filter(
      ([_, col]) => !col.shouldDisableInsert()
    );
    const insertOrder = colEntries.map(([, column]) => sql.identifier(this.casing.getColumnCasing(column)));
    if (select) {
      const select2 = valuesOrSelect;
      if (is(select2, SQL)) {
        valuesSqlList.push(select2);
      } else {
        valuesSqlList.push(select2.getSQL());
      }
    } else {
      const values = valuesOrSelect;
      valuesSqlList.push(sql.raw("values "));
      for (const [valueIndex, value] of values.entries()) {
        const valueList = [];
        for (const [fieldName, col] of colEntries) {
          const colValue = value[fieldName];
          if (colValue === void 0 || is(colValue, Param) && colValue.value === void 0) {
            let defaultValue;
            if (col.default !== null && col.default !== void 0) {
              defaultValue = is(col.default, SQL) ? col.default : sql.param(col.default, col);
            } else if (col.defaultFn !== void 0) {
              const defaultFnResult = col.defaultFn();
              defaultValue = is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col);
            } else if (!col.default && col.onUpdateFn !== void 0) {
              const onUpdateFnResult = col.onUpdateFn();
              defaultValue = is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col);
            } else {
              defaultValue = sql`null`;
            }
            valueList.push(defaultValue);
          } else {
            valueList.push(colValue);
          }
        }
        valuesSqlList.push(valueList);
        if (valueIndex < values.length - 1) {
          valuesSqlList.push(sql`, `);
        }
      }
    }
    const withSql = this.buildWithCTE(withList);
    const valuesSql = sql.join(valuesSqlList);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const onConflictSql = onConflict?.length ? sql.join(onConflict) : void 0;
    return sql`${withSql}insert into ${table} ${insertOrder} ${valuesSql}${onConflictSql}${returningSql}`;
  }
  sqlToQuery(sql2, invokeSource) {
    return sql2.toQuery({
      casing: this.casing,
      escapeName: this.escapeName,
      escapeParam: this.escapeParam,
      escapeString: this.escapeString,
      invokeSource
    });
  }
  buildRelationalQuery({
    fullSchema,
    schema,
    tableNamesMap,
    table,
    tableConfig,
    queryConfig: config,
    tableAlias,
    nestedQueryRelation,
    joinOn
  }) {
    let selection = [];
    let limit, offset, orderBy = [], where;
    const joins = [];
    if (config === true) {
      const selectionEntries = Object.entries(tableConfig.columns);
      selection = selectionEntries.map(([key, value]) => ({
        dbKey: value.name,
        tsKey: key,
        field: aliasedTableColumn(value, tableAlias),
        relationTableTsKey: void 0,
        isJson: false,
        selection: []
      }));
    } else {
      const aliasedColumns = Object.fromEntries(
        Object.entries(tableConfig.columns).map(([key, value]) => [key, aliasedTableColumn(value, tableAlias)])
      );
      if (config.where) {
        const whereSql = typeof config.where === "function" ? config.where(aliasedColumns, getOperators()) : config.where;
        where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
      }
      const fieldsSelection = [];
      let selectedColumns = [];
      if (config.columns) {
        let isIncludeMode = false;
        for (const [field, value] of Object.entries(config.columns)) {
          if (value === void 0) {
            continue;
          }
          if (field in tableConfig.columns) {
            if (!isIncludeMode && value === true) {
              isIncludeMode = true;
            }
            selectedColumns.push(field);
          }
        }
        if (selectedColumns.length > 0) {
          selectedColumns = isIncludeMode ? selectedColumns.filter((c) => config.columns?.[c] === true) : Object.keys(tableConfig.columns).filter((key) => !selectedColumns.includes(key));
        }
      } else {
        selectedColumns = Object.keys(tableConfig.columns);
      }
      for (const field of selectedColumns) {
        const column = tableConfig.columns[field];
        fieldsSelection.push({ tsKey: field, value: column });
      }
      let selectedRelations = [];
      if (config.with) {
        selectedRelations = Object.entries(config.with).filter((entry) => !!entry[1]).map(([tsKey, queryConfig]) => ({ tsKey, queryConfig, relation: tableConfig.relations[tsKey] }));
      }
      let extras;
      if (config.extras) {
        extras = typeof config.extras === "function" ? config.extras(aliasedColumns, { sql }) : config.extras;
        for (const [tsKey, value] of Object.entries(extras)) {
          fieldsSelection.push({
            tsKey,
            value: mapColumnsInAliasedSQLToAlias(value, tableAlias)
          });
        }
      }
      for (const { tsKey, value } of fieldsSelection) {
        selection.push({
          dbKey: is(value, SQL.Aliased) ? value.fieldAlias : tableConfig.columns[tsKey].name,
          tsKey,
          field: is(value, Column) ? aliasedTableColumn(value, tableAlias) : value,
          relationTableTsKey: void 0,
          isJson: false,
          selection: []
        });
      }
      let orderByOrig = typeof config.orderBy === "function" ? config.orderBy(aliasedColumns, getOrderByOperators()) : config.orderBy ?? [];
      if (!Array.isArray(orderByOrig)) {
        orderByOrig = [orderByOrig];
      }
      orderBy = orderByOrig.map((orderByValue) => {
        if (is(orderByValue, Column)) {
          return aliasedTableColumn(orderByValue, tableAlias);
        }
        return mapColumnsInSQLToAlias(orderByValue, tableAlias);
      });
      limit = config.limit;
      offset = config.offset;
      for (const {
        tsKey: selectedRelationTsKey,
        queryConfig: selectedRelationConfigValue,
        relation
      } of selectedRelations) {
        const normalizedRelation = normalizeRelation(schema, tableNamesMap, relation);
        const relationTableName = getTableUniqueName(relation.referencedTable);
        const relationTableTsName = tableNamesMap[relationTableName];
        const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
        const joinOn2 = and(
          ...normalizedRelation.fields.map(
            (field2, i) => eq(
              aliasedTableColumn(normalizedRelation.references[i], relationTableAlias),
              aliasedTableColumn(field2, tableAlias)
            )
          )
        );
        const builtRelation = this.buildRelationalQuery({
          fullSchema,
          schema,
          tableNamesMap,
          table: fullSchema[relationTableTsName],
          tableConfig: schema[relationTableTsName],
          queryConfig: is(relation, One) ? selectedRelationConfigValue === true ? { limit: 1 } : { ...selectedRelationConfigValue, limit: 1 } : selectedRelationConfigValue,
          tableAlias: relationTableAlias,
          joinOn: joinOn2,
          nestedQueryRelation: relation
        });
        const field = sql`(${builtRelation.sql})`.as(selectedRelationTsKey);
        selection.push({
          dbKey: selectedRelationTsKey,
          tsKey: selectedRelationTsKey,
          field,
          relationTableTsKey: relationTableTsName,
          isJson: true,
          selection: builtRelation.selection
        });
      }
    }
    if (selection.length === 0) {
      throw new DrizzleError({
        message: `No fields selected for table "${tableConfig.tsName}" ("${tableAlias}"). You need to have at least one item in "columns", "with" or "extras". If you need to select all columns, omit the "columns" key or set it to undefined.`
      });
    }
    let result;
    where = and(joinOn, where);
    if (nestedQueryRelation) {
      let field = sql`json_array(${sql.join(
        selection.map(
          ({ field: field2 }) => is(field2, SQLiteColumn) ? sql.identifier(this.casing.getColumnCasing(field2)) : is(field2, SQL.Aliased) ? field2.sql : field2
        ),
        sql`, `
      )})`;
      if (is(nestedQueryRelation, Many)) {
        field = sql`coalesce(json_group_array(${field}), json_array())`;
      }
      const nestedSelection = [{
        dbKey: "data",
        tsKey: "data",
        field: field.as("data"),
        isJson: true,
        relationTableTsKey: tableConfig.tsName,
        selection
      }];
      const needsSubquery = limit !== void 0 || offset !== void 0 || orderBy.length > 0;
      if (needsSubquery) {
        result = this.buildSelectQuery({
          table: aliasedTable(table, tableAlias),
          fields: {},
          fieldsFlat: [
            {
              path: [],
              field: sql.raw("*")
            }
          ],
          where,
          limit,
          offset,
          orderBy,
          setOperators: []
        });
        where = void 0;
        limit = void 0;
        offset = void 0;
        orderBy = void 0;
      } else {
        result = aliasedTable(table, tableAlias);
      }
      result = this.buildSelectQuery({
        table: is(result, SQLiteTable) ? result : new Subquery(result, {}, tableAlias),
        fields: {},
        fieldsFlat: nestedSelection.map(({ field: field2 }) => ({
          path: [],
          field: is(field2, Column) ? aliasedTableColumn(field2, tableAlias) : field2
        })),
        joins,
        where,
        limit,
        offset,
        orderBy,
        setOperators: []
      });
    } else {
      result = this.buildSelectQuery({
        table: aliasedTable(table, tableAlias),
        fields: {},
        fieldsFlat: selection.map(({ field }) => ({
          path: [],
          field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field
        })),
        joins,
        where,
        limit,
        offset,
        orderBy,
        setOperators: []
      });
    }
    return {
      tableTsKey: tableConfig.tsName,
      sql: result,
      selection
    };
  }
};
var SQLiteSyncDialect = class extends SQLiteDialect {
  static {
    __name(this, "SQLiteSyncDialect");
  }
  static [entityKind] = "SQLiteSyncDialect";
  migrate(migrations, session, config) {
    const migrationsTable = config === void 0 ? "__drizzle_migrations" : typeof config === "string" ? "__drizzle_migrations" : config.migrationsTable ?? "__drizzle_migrations";
    const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
    session.run(migrationTableCreate);
    const dbMigrations = session.values(
      sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`
    );
    const lastDbMigration = dbMigrations[0] ?? void 0;
    session.run(sql`BEGIN`);
    try {
      for (const migration of migrations) {
        if (!lastDbMigration || Number(lastDbMigration[2]) < migration.folderMillis) {
          for (const stmt of migration.sql) {
            session.run(sql.raw(stmt));
          }
          session.run(
            sql`INSERT INTO ${sql.identifier(migrationsTable)} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`
          );
        }
      }
      session.run(sql`COMMIT`);
    } catch (e) {
      session.run(sql`ROLLBACK`);
      throw e;
    }
  }
};
var SQLiteAsyncDialect = class extends SQLiteDialect {
  static {
    __name(this, "SQLiteAsyncDialect");
  }
  static [entityKind] = "SQLiteAsyncDialect";
  async migrate(migrations, session, config) {
    const migrationsTable = config === void 0 ? "__drizzle_migrations" : typeof config === "string" ? "__drizzle_migrations" : config.migrationsTable ?? "__drizzle_migrations";
    const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
    await session.run(migrationTableCreate);
    const dbMigrations = await session.values(
      sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`
    );
    const lastDbMigration = dbMigrations[0] ?? void 0;
    await session.transaction(async (tx) => {
      for (const migration of migrations) {
        if (!lastDbMigration || Number(lastDbMigration[2]) < migration.folderMillis) {
          for (const stmt of migration.sql) {
            await tx.run(sql.raw(stmt));
          }
          await tx.run(
            sql`INSERT INTO ${sql.identifier(migrationsTable)} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`
          );
        }
      }
    });
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/query-builders/query-builder.js
var TypedQueryBuilder = class {
  static {
    __name(this, "TypedQueryBuilder");
  }
  static [entityKind] = "TypedQueryBuilder";
  /** @internal */
  getSelectedFields() {
    return this._.selectedFields;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/query-builders/select.js
var SQLiteSelectBuilder = class {
  static {
    __name(this, "SQLiteSelectBuilder");
  }
  static [entityKind] = "SQLiteSelectBuilder";
  fields;
  session;
  dialect;
  withList;
  distinct;
  constructor(config) {
    this.fields = config.fields;
    this.session = config.session;
    this.dialect = config.dialect;
    this.withList = config.withList;
    this.distinct = config.distinct;
  }
  from(source) {
    const isPartialSelect = !!this.fields;
    let fields;
    if (this.fields) {
      fields = this.fields;
    } else if (is(source, Subquery)) {
      fields = Object.fromEntries(
        Object.keys(source._.selectedFields).map((key) => [key, source[key]])
      );
    } else if (is(source, SQLiteViewBase)) {
      fields = source[ViewBaseConfig].selectedFields;
    } else if (is(source, SQL)) {
      fields = {};
    } else {
      fields = getTableColumns(source);
    }
    return new SQLiteSelectBase({
      table: source,
      fields,
      isPartialSelect,
      session: this.session,
      dialect: this.dialect,
      withList: this.withList,
      distinct: this.distinct
    });
  }
};
var SQLiteSelectQueryBuilderBase = class extends TypedQueryBuilder {
  static {
    __name(this, "SQLiteSelectQueryBuilderBase");
  }
  static [entityKind] = "SQLiteSelectQueryBuilder";
  _;
  /** @internal */
  config;
  joinsNotNullableMap;
  tableName;
  isPartialSelect;
  session;
  dialect;
  cacheConfig = void 0;
  usedTables = /* @__PURE__ */ new Set();
  constructor({ table, fields, isPartialSelect, session, dialect, withList, distinct }) {
    super();
    this.config = {
      withList,
      table,
      fields: { ...fields },
      distinct,
      setOperators: []
    };
    this.isPartialSelect = isPartialSelect;
    this.session = session;
    this.dialect = dialect;
    this._ = {
      selectedFields: fields,
      config: this.config
    };
    this.tableName = getTableLikeName(table);
    this.joinsNotNullableMap = typeof this.tableName === "string" ? { [this.tableName]: true } : {};
    for (const item of extractUsedTable(table)) this.usedTables.add(item);
  }
  /** @internal */
  getUsedTables() {
    return [...this.usedTables];
  }
  createJoin(joinType) {
    return (table, on) => {
      const baseTableName = this.tableName;
      const tableName = getTableLikeName(table);
      for (const item of extractUsedTable(table)) this.usedTables.add(item);
      if (typeof tableName === "string" && this.config.joins?.some((join) => join.alias === tableName)) {
        throw new Error(`Alias "${tableName}" is already used in this query`);
      }
      if (!this.isPartialSelect) {
        if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === "string") {
          this.config.fields = {
            [baseTableName]: this.config.fields
          };
        }
        if (typeof tableName === "string" && !is(table, SQL)) {
          const selection = is(table, Subquery) ? table._.selectedFields : is(table, View) ? table[ViewBaseConfig].selectedFields : table[Table.Symbol.Columns];
          this.config.fields[tableName] = selection;
        }
      }
      if (typeof on === "function") {
        on = on(
          new Proxy(
            this.config.fields,
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          )
        );
      }
      if (!this.config.joins) {
        this.config.joins = [];
      }
      this.config.joins.push({ on, table, joinType, alias: tableName });
      if (typeof tableName === "string") {
        switch (joinType) {
          case "left": {
            this.joinsNotNullableMap[tableName] = false;
            break;
          }
          case "right": {
            this.joinsNotNullableMap = Object.fromEntries(
              Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false])
            );
            this.joinsNotNullableMap[tableName] = true;
            break;
          }
          case "cross":
          case "inner": {
            this.joinsNotNullableMap[tableName] = true;
            break;
          }
          case "full": {
            this.joinsNotNullableMap = Object.fromEntries(
              Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false])
            );
            this.joinsNotNullableMap[tableName] = false;
            break;
          }
        }
      }
      return this;
    };
  }
  /**
   * Executes a `left join` operation by adding another table to the current query.
   *
   * Calling this method associates each row of the table with the corresponding row from the joined table, if a match is found. If no matching row exists, it sets all columns of the joined table to null.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#left-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User; pets: Pet | null; }[] = await db.select()
   *   .from(users)
   *   .leftJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number; petId: number | null; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .leftJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  leftJoin = this.createJoin("left");
  /**
   * Executes a `right join` operation by adding another table to the current query.
   *
   * Calling this method associates each row of the joined table with the corresponding row from the main table, if a match is found. If no matching row exists, it sets all columns of the main table to null.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#right-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User | null; pets: Pet; }[] = await db.select()
   *   .from(users)
   *   .rightJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number | null; petId: number; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .rightJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  rightJoin = this.createJoin("right");
  /**
   * Executes an `inner join` operation, creating a new table by combining rows from two tables that have matching values.
   *
   * Calling this method retrieves rows that have corresponding entries in both joined tables. Rows without matching entries in either table are excluded, resulting in a table that includes only matching pairs.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#inner-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
   *   .from(users)
   *   .innerJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .innerJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  innerJoin = this.createJoin("inner");
  /**
   * Executes a `full join` operation by combining rows from two tables into a new table.
   *
   * Calling this method retrieves all rows from both main and joined tables, merging rows with matching values and filling in `null` for non-matching columns.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#full-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User | null; pets: Pet | null; }[] = await db.select()
   *   .from(users)
   *   .fullJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number | null; petId: number | null; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .fullJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  fullJoin = this.createJoin("full");
  /**
   * Executes a `cross join` operation by combining rows from two tables into a new table.
   *
   * Calling this method retrieves all rows from both main and joined tables, merging all rows from each table.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#cross-join}
   *
   * @param table the table to join.
   *
   * @example
   *
   * ```ts
   * // Select all users, each user with every pet
   * const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
   *   .from(users)
   *   .crossJoin(pets)
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .crossJoin(pets)
   * ```
   */
  crossJoin = this.createJoin("cross");
  createSetOperator(type, isAll) {
    return (rightSelection) => {
      const rightSelect = typeof rightSelection === "function" ? rightSelection(getSQLiteSetOperators()) : rightSelection;
      if (!haveSameKeys(this.getSelectedFields(), rightSelect.getSelectedFields())) {
        throw new Error(
          "Set operator error (union / intersect / except): selected fields are not the same or are in a different order"
        );
      }
      this.config.setOperators.push({ type, isAll, rightSelect });
      return this;
    };
  }
  /**
   * Adds `union` set operator to the query.
   *
   * Calling this method will combine the result sets of the `select` statements and remove any duplicate rows that appear across them.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#union}
   *
   * @example
   *
   * ```ts
   * // Select all unique names from customers and users tables
   * await db.select({ name: users.name })
   *   .from(users)
   *   .union(
   *     db.select({ name: customers.name }).from(customers)
   *   );
   * // or
   * import { union } from 'drizzle-orm/sqlite-core'
   *
   * await union(
   *   db.select({ name: users.name }).from(users),
   *   db.select({ name: customers.name }).from(customers)
   * );
   * ```
   */
  union = this.createSetOperator("union", false);
  /**
   * Adds `union all` set operator to the query.
   *
   * Calling this method will combine the result-set of the `select` statements and keep all duplicate rows that appear across them.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#union-all}
   *
   * @example
   *
   * ```ts
   * // Select all transaction ids from both online and in-store sales
   * await db.select({ transaction: onlineSales.transactionId })
   *   .from(onlineSales)
   *   .unionAll(
   *     db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
   *   );
   * // or
   * import { unionAll } from 'drizzle-orm/sqlite-core'
   *
   * await unionAll(
   *   db.select({ transaction: onlineSales.transactionId }).from(onlineSales),
   *   db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
   * );
   * ```
   */
  unionAll = this.createSetOperator("union", true);
  /**
   * Adds `intersect` set operator to the query.
   *
   * Calling this method will retain only the rows that are present in both result sets and eliminate duplicates.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#intersect}
   *
   * @example
   *
   * ```ts
   * // Select course names that are offered in both departments A and B
   * await db.select({ courseName: depA.courseName })
   *   .from(depA)
   *   .intersect(
   *     db.select({ courseName: depB.courseName }).from(depB)
   *   );
   * // or
   * import { intersect } from 'drizzle-orm/sqlite-core'
   *
   * await intersect(
   *   db.select({ courseName: depA.courseName }).from(depA),
   *   db.select({ courseName: depB.courseName }).from(depB)
   * );
   * ```
   */
  intersect = this.createSetOperator("intersect", false);
  /**
   * Adds `except` set operator to the query.
   *
   * Calling this method will retrieve all unique rows from the left query, except for the rows that are present in the result set of the right query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#except}
   *
   * @example
   *
   * ```ts
   * // Select all courses offered in department A but not in department B
   * await db.select({ courseName: depA.courseName })
   *   .from(depA)
   *   .except(
   *     db.select({ courseName: depB.courseName }).from(depB)
   *   );
   * // or
   * import { except } from 'drizzle-orm/sqlite-core'
   *
   * await except(
   *   db.select({ courseName: depA.courseName }).from(depA),
   *   db.select({ courseName: depB.courseName }).from(depB)
   * );
   * ```
   */
  except = this.createSetOperator("except", false);
  /** @internal */
  addSetOperators(setOperators) {
    this.config.setOperators.push(...setOperators);
    return this;
  }
  /**
   * Adds a `where` clause to the query.
   *
   * Calling this method will select only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#filtering}
   *
   * @param where the `where` clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be selected.
   *
   * ```ts
   * // Select all cars with green color
   * await db.select().from(cars).where(eq(cars.color, 'green'));
   * // or
   * await db.select().from(cars).where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Select all BMW cars with a green color
   * await db.select().from(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Select all cars with the green or blue color
   * await db.select().from(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(where) {
    if (typeof where === "function") {
      where = where(
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
        )
      );
    }
    this.config.where = where;
    return this;
  }
  /**
   * Adds a `having` clause to the query.
   *
   * Calling this method will select only those rows that fulfill a specified condition. It is typically used with aggregate functions to filter the aggregated data based on a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#aggregations}
   *
   * @param having the `having` clause.
   *
   * @example
   *
   * ```ts
   * // Select all brands with more than one car
   * await db.select({
   * 	brand: cars.brand,
   * 	count: sql<number>`cast(count(${cars.id}) as int)`,
   * })
   *   .from(cars)
   *   .groupBy(cars.brand)
   *   .having(({ count }) => gt(count, 1));
   * ```
   */
  having(having) {
    if (typeof having === "function") {
      having = having(
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
        )
      );
    }
    this.config.having = having;
    return this;
  }
  groupBy(...columns) {
    if (typeof columns[0] === "function") {
      const groupBy = columns[0](
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
    } else {
      this.config.groupBy = columns;
    }
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      if (this.config.setOperators.length > 0) {
        this.config.setOperators.at(-1).orderBy = orderByArray;
      } else {
        this.config.orderBy = orderByArray;
      }
    } else {
      const orderByArray = columns;
      if (this.config.setOperators.length > 0) {
        this.config.setOperators.at(-1).orderBy = orderByArray;
      } else {
        this.config.orderBy = orderByArray;
      }
    }
    return this;
  }
  /**
   * Adds a `limit` clause to the query.
   *
   * Calling this method will set the maximum number of rows that will be returned by this query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
   *
   * @param limit the `limit` clause.
   *
   * @example
   *
   * ```ts
   * // Get the first 10 people from this query.
   * await db.select().from(people).limit(10);
   * ```
   */
  limit(limit) {
    if (this.config.setOperators.length > 0) {
      this.config.setOperators.at(-1).limit = limit;
    } else {
      this.config.limit = limit;
    }
    return this;
  }
  /**
   * Adds an `offset` clause to the query.
   *
   * Calling this method will skip a number of rows when returning results from this query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
   *
   * @param offset the `offset` clause.
   *
   * @example
   *
   * ```ts
   * // Get the 10th-20th people from this query.
   * await db.select().from(people).offset(10).limit(10);
   * ```
   */
  offset(offset) {
    if (this.config.setOperators.length > 0) {
      this.config.setOperators.at(-1).offset = offset;
    } else {
      this.config.offset = offset;
    }
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildSelectQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  as(alias) {
    const usedTables = [];
    usedTables.push(...extractUsedTable(this.config.table));
    if (this.config.joins) {
      for (const it of this.config.joins) usedTables.push(...extractUsedTable(it.table));
    }
    return new Proxy(
      new Subquery(this.getSQL(), this.config.fields, alias, false, [...new Set(usedTables)]),
      new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
    );
  }
  /** @internal */
  getSelectedFields() {
    return new Proxy(
      this.config.fields,
      new SelectionProxyHandler({ alias: this.tableName, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
    );
  }
  $dynamic() {
    return this;
  }
};
var SQLiteSelectBase = class extends SQLiteSelectQueryBuilderBase {
  static {
    __name(this, "SQLiteSelectBase");
  }
  static [entityKind] = "SQLiteSelect";
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    if (!this.session) {
      throw new Error("Cannot execute a query on a query builder. Please use a database instance instead.");
    }
    const fieldsList = orderSelectedFields(this.config.fields);
    const query = this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      fieldsList,
      "all",
      true,
      void 0,
      {
        type: "select",
        tables: [...this.usedTables]
      },
      this.cacheConfig
    );
    query.joinsNotNullableMap = this.joinsNotNullableMap;
    return query;
  }
  $withCache(config) {
    this.cacheConfig = config === void 0 ? { config: {}, enable: true, autoInvalidate: true } : config === false ? { enable: false } : { enable: true, autoInvalidate: true, ...config };
    return this;
  }
  prepare() {
    return this._prepare(false);
  }
  run = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().run(placeholderValues);
  }, "run");
  all = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().all(placeholderValues);
  }, "all");
  get = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().get(placeholderValues);
  }, "get");
  values = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().values(placeholderValues);
  }, "values");
  async execute() {
    return this.all();
  }
};
applyMixins(SQLiteSelectBase, [QueryPromise]);
function createSetOperator(type, isAll) {
  return (leftSelect, rightSelect, ...restSelects) => {
    const setOperators = [rightSelect, ...restSelects].map((select) => ({
      type,
      isAll,
      rightSelect: select
    }));
    for (const setOperator of setOperators) {
      if (!haveSameKeys(leftSelect.getSelectedFields(), setOperator.rightSelect.getSelectedFields())) {
        throw new Error(
          "Set operator error (union / intersect / except): selected fields are not the same or are in a different order"
        );
      }
    }
    return leftSelect.addSetOperators(setOperators);
  };
}
__name(createSetOperator, "createSetOperator");
var getSQLiteSetOperators = /* @__PURE__ */ __name(() => ({
  union,
  unionAll,
  intersect,
  except
}), "getSQLiteSetOperators");
var union = createSetOperator("union", false);
var unionAll = createSetOperator("union", true);
var intersect = createSetOperator("intersect", false);
var except = createSetOperator("except", false);

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/query-builders/query-builder.js
var QueryBuilder = class {
  static {
    __name(this, "QueryBuilder");
  }
  static [entityKind] = "SQLiteQueryBuilder";
  dialect;
  dialectConfig;
  constructor(dialect) {
    this.dialect = is(dialect, SQLiteDialect) ? dialect : void 0;
    this.dialectConfig = is(dialect, SQLiteDialect) ? void 0 : dialect;
  }
  $with = /* @__PURE__ */ __name((alias, selection) => {
    const queryBuilder = this;
    const as = /* @__PURE__ */ __name((qb) => {
      if (typeof qb === "function") {
        qb = qb(queryBuilder);
      }
      return new Proxy(
        new WithSubquery(
          qb.getSQL(),
          selection ?? ("getSelectedFields" in qb ? qb.getSelectedFields() ?? {} : {}),
          alias,
          true
        ),
        new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
      );
    }, "as");
    return { as };
  }, "$with");
  with(...queries) {
    const self = this;
    function select(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: void 0,
        dialect: self.getDialect(),
        withList: queries
      });
    }
    __name(select, "select");
    function selectDistinct(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: void 0,
        dialect: self.getDialect(),
        withList: queries,
        distinct: true
      });
    }
    __name(selectDistinct, "selectDistinct");
    return { select, selectDistinct };
  }
  select(fields) {
    return new SQLiteSelectBuilder({ fields: fields ?? void 0, session: void 0, dialect: this.getDialect() });
  }
  selectDistinct(fields) {
    return new SQLiteSelectBuilder({
      fields: fields ?? void 0,
      session: void 0,
      dialect: this.getDialect(),
      distinct: true
    });
  }
  // Lazy load dialect to avoid circular dependency
  getDialect() {
    if (!this.dialect) {
      this.dialect = new SQLiteSyncDialect(this.dialectConfig);
    }
    return this.dialect;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/query-builders/insert.js
var SQLiteInsertBuilder = class {
  static {
    __name(this, "SQLiteInsertBuilder");
  }
  constructor(table, session, dialect, withList) {
    this.table = table;
    this.session = session;
    this.dialect = dialect;
    this.withList = withList;
  }
  static [entityKind] = "SQLiteInsertBuilder";
  values(values) {
    values = Array.isArray(values) ? values : [values];
    if (values.length === 0) {
      throw new Error("values() must be called with at least one value");
    }
    const mappedValues = values.map((entry) => {
      const result = {};
      const cols = this.table[Table.Symbol.Columns];
      for (const colKey of Object.keys(entry)) {
        const colValue = entry[colKey];
        result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue, cols[colKey]);
      }
      return result;
    });
    return new SQLiteInsertBase(this.table, mappedValues, this.session, this.dialect, this.withList);
  }
  select(selectQuery) {
    const select = typeof selectQuery === "function" ? selectQuery(new QueryBuilder()) : selectQuery;
    if (!is(select, SQL) && !haveSameKeys(this.table[Columns], select._.selectedFields)) {
      throw new Error(
        "Insert select error: selected fields are not the same or are in a different order compared to the table definition"
      );
    }
    return new SQLiteInsertBase(this.table, select, this.session, this.dialect, this.withList, true);
  }
};
var SQLiteInsertBase = class extends QueryPromise {
  static {
    __name(this, "SQLiteInsertBase");
  }
  constructor(table, values, session, dialect, withList, select) {
    super();
    this.session = session;
    this.dialect = dialect;
    this.config = { table, values, withList, select };
  }
  static [entityKind] = "SQLiteInsert";
  /** @internal */
  config;
  returning(fields = this.config.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
  }
  /**
   * Adds an `on conflict do nothing` clause to the query.
   *
   * Calling this method simply avoids inserting a row as its alternative action.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert#on-conflict-do-nothing}
   *
   * @param config The `target` and `where` clauses.
   *
   * @example
   * ```ts
   * // Insert one row and cancel the insert if there's a conflict
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoNothing();
   *
   * // Explicitly specify conflict target
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoNothing({ target: cars.id });
   * ```
   */
  onConflictDoNothing(config = {}) {
    if (!this.config.onConflict) this.config.onConflict = [];
    if (config.target === void 0) {
      this.config.onConflict.push(sql` on conflict do nothing`);
    } else {
      const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
      const whereSql = config.where ? sql` where ${config.where}` : sql``;
      this.config.onConflict.push(sql` on conflict ${targetSql} do nothing${whereSql}`);
    }
    return this;
  }
  /**
   * Adds an `on conflict do update` clause to the query.
   *
   * Calling this method will update the existing row that conflicts with the row proposed for insertion as its alternative action.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert#upserts-and-conflicts}
   *
   * @param config The `target`, `set` and `where` clauses.
   *
   * @example
   * ```ts
   * // Update the row if there's a conflict
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoUpdate({
   *     target: cars.id,
   *     set: { brand: 'Porsche' }
   *   });
   *
   * // Upsert with 'where' clause
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoUpdate({
   *     target: cars.id,
   *     set: { brand: 'newBMW' },
   *     where: sql`${cars.createdAt} > '2023-01-01'::date`,
   *   });
   * ```
   */
  onConflictDoUpdate(config) {
    if (config.where && (config.targetWhere || config.setWhere)) {
      throw new Error(
        'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.'
      );
    }
    if (!this.config.onConflict) this.config.onConflict = [];
    const whereSql = config.where ? sql` where ${config.where}` : void 0;
    const targetWhereSql = config.targetWhere ? sql` where ${config.targetWhere}` : void 0;
    const setWhereSql = config.setWhere ? sql` where ${config.setWhere}` : void 0;
    const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
    const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
    this.config.onConflict.push(
      sql` on conflict ${targetSql}${targetWhereSql} do update set ${setSql}${whereSql}${setWhereSql}`
    );
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildInsertQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "insert",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  run = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().run(placeholderValues);
  }, "run");
  all = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().all(placeholderValues);
  }, "all");
  get = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().get(placeholderValues);
  }, "get");
  values = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().values(placeholderValues);
  }, "values");
  async execute() {
    return this.config.returning ? this.all() : this.run();
  }
  $dynamic() {
    return this;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/query-builders/update.js
var SQLiteUpdateBuilder = class {
  static {
    __name(this, "SQLiteUpdateBuilder");
  }
  constructor(table, session, dialect, withList) {
    this.table = table;
    this.session = session;
    this.dialect = dialect;
    this.withList = withList;
  }
  static [entityKind] = "SQLiteUpdateBuilder";
  set(values) {
    return new SQLiteUpdateBase(
      this.table,
      mapUpdateSet(this.table, values),
      this.session,
      this.dialect,
      this.withList
    );
  }
};
var SQLiteUpdateBase = class extends QueryPromise {
  static {
    __name(this, "SQLiteUpdateBase");
  }
  constructor(table, set, session, dialect, withList) {
    super();
    this.session = session;
    this.dialect = dialect;
    this.config = { set, table, withList, joins: [] };
  }
  static [entityKind] = "SQLiteUpdate";
  /** @internal */
  config;
  from(source) {
    this.config.from = source;
    return this;
  }
  createJoin(joinType) {
    return (table, on) => {
      const tableName = getTableLikeName(table);
      if (typeof tableName === "string" && this.config.joins.some((join) => join.alias === tableName)) {
        throw new Error(`Alias "${tableName}" is already used in this query`);
      }
      if (typeof on === "function") {
        const from = this.config.from ? is(table, SQLiteTable) ? table[Table.Symbol.Columns] : is(table, Subquery) ? table._.selectedFields : is(table, SQLiteViewBase) ? table[ViewBaseConfig].selectedFields : void 0 : void 0;
        on = on(
          new Proxy(
            this.config.table[Table.Symbol.Columns],
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          ),
          from && new Proxy(
            from,
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          )
        );
      }
      this.config.joins.push({ on, table, joinType, alias: tableName });
      return this;
    };
  }
  leftJoin = this.createJoin("left");
  rightJoin = this.createJoin("right");
  innerJoin = this.createJoin("inner");
  fullJoin = this.createJoin("full");
  /**
   * Adds a 'where' clause to the query.
   *
   * Calling this method will update only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/update}
   *
   * @param where the 'where' clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be updated.
   *
   * ```ts
   * // Update all cars with green color
   * db.update(cars).set({ color: 'red' })
   *   .where(eq(cars.color, 'green'));
   * // or
   * db.update(cars).set({ color: 'red' })
   *   .where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Update all BMW cars with a green color
   * db.update(cars).set({ color: 'red' })
   *   .where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Update all cars with the green or blue color
   * db.update(cars).set({ color: 'red' })
   *   .where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(where) {
    this.config.where = where;
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.table[Table.Symbol.Columns],
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      this.config.orderBy = orderByArray;
    } else {
      const orderByArray = columns;
      this.config.orderBy = orderByArray;
    }
    return this;
  }
  limit(limit) {
    this.config.limit = limit;
    return this;
  }
  returning(fields = this.config.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildUpdateQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "insert",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  run = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().run(placeholderValues);
  }, "run");
  all = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().all(placeholderValues);
  }, "all");
  get = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().get(placeholderValues);
  }, "get");
  values = /* @__PURE__ */ __name((placeholderValues) => {
    return this._prepare().values(placeholderValues);
  }, "values");
  async execute() {
    return this.config.returning ? this.all() : this.run();
  }
  $dynamic() {
    return this;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/query-builders/count.js
var SQLiteCountBuilder = class _SQLiteCountBuilder extends SQL {
  static {
    __name(this, "SQLiteCountBuilder");
  }
  constructor(params) {
    super(_SQLiteCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);
    this.params = params;
    this.session = params.session;
    this.sql = _SQLiteCountBuilder.buildCount(
      params.source,
      params.filters
    );
  }
  sql;
  static [entityKind] = "SQLiteCountBuilderAsync";
  [Symbol.toStringTag] = "SQLiteCountBuilderAsync";
  session;
  static buildEmbeddedCount(source, filters) {
    return sql`(select count(*) from ${source}${sql.raw(" where ").if(filters)}${filters})`;
  }
  static buildCount(source, filters) {
    return sql`select count(*) from ${source}${sql.raw(" where ").if(filters)}${filters}`;
  }
  then(onfulfilled, onrejected) {
    return Promise.resolve(this.session.count(this.sql)).then(
      onfulfilled,
      onrejected
    );
  }
  catch(onRejected) {
    return this.then(void 0, onRejected);
  }
  finally(onFinally) {
    return this.then(
      (value) => {
        onFinally?.();
        return value;
      },
      (reason) => {
        onFinally?.();
        throw reason;
      }
    );
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/query-builders/query.js
var RelationalQueryBuilder = class {
  static {
    __name(this, "RelationalQueryBuilder");
  }
  constructor(mode, fullSchema, schema, tableNamesMap, table, tableConfig, dialect, session) {
    this.mode = mode;
    this.fullSchema = fullSchema;
    this.schema = schema;
    this.tableNamesMap = tableNamesMap;
    this.table = table;
    this.tableConfig = tableConfig;
    this.dialect = dialect;
    this.session = session;
  }
  static [entityKind] = "SQLiteAsyncRelationalQueryBuilder";
  findMany(config) {
    return this.mode === "sync" ? new SQLiteSyncRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? config : {},
      "many"
    ) : new SQLiteRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? config : {},
      "many"
    );
  }
  findFirst(config) {
    return this.mode === "sync" ? new SQLiteSyncRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? { ...config, limit: 1 } : { limit: 1 },
      "first"
    ) : new SQLiteRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? { ...config, limit: 1 } : { limit: 1 },
      "first"
    );
  }
};
var SQLiteRelationalQuery = class extends QueryPromise {
  static {
    __name(this, "SQLiteRelationalQuery");
  }
  constructor(fullSchema, schema, tableNamesMap, table, tableConfig, dialect, session, config, mode) {
    super();
    this.fullSchema = fullSchema;
    this.schema = schema;
    this.tableNamesMap = tableNamesMap;
    this.table = table;
    this.tableConfig = tableConfig;
    this.dialect = dialect;
    this.session = session;
    this.config = config;
    this.mode = mode;
  }
  static [entityKind] = "SQLiteAsyncRelationalQuery";
  /** @internal */
  mode;
  /** @internal */
  getSQL() {
    return this.dialect.buildRelationalQuery({
      fullSchema: this.fullSchema,
      schema: this.schema,
      tableNamesMap: this.tableNamesMap,
      table: this.table,
      tableConfig: this.tableConfig,
      queryConfig: this.config,
      tableAlias: this.tableConfig.tsName
    }).sql;
  }
  /** @internal */
  _prepare(isOneTimeQuery = false) {
    const { query, builtQuery } = this._toSQL();
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      builtQuery,
      void 0,
      this.mode === "first" ? "get" : "all",
      true,
      (rawRows, mapColumnValue) => {
        const rows = rawRows.map(
          (row) => mapRelationalRow(this.schema, this.tableConfig, row, query.selection, mapColumnValue)
        );
        if (this.mode === "first") {
          return rows[0];
        }
        return rows;
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  _toSQL() {
    const query = this.dialect.buildRelationalQuery({
      fullSchema: this.fullSchema,
      schema: this.schema,
      tableNamesMap: this.tableNamesMap,
      table: this.table,
      tableConfig: this.tableConfig,
      queryConfig: this.config,
      tableAlias: this.tableConfig.tsName
    });
    const builtQuery = this.dialect.sqlToQuery(query.sql);
    return { query, builtQuery };
  }
  toSQL() {
    return this._toSQL().builtQuery;
  }
  /** @internal */
  executeRaw() {
    if (this.mode === "first") {
      return this._prepare(false).get();
    }
    return this._prepare(false).all();
  }
  async execute() {
    return this.executeRaw();
  }
};
var SQLiteSyncRelationalQuery = class extends SQLiteRelationalQuery {
  static {
    __name(this, "SQLiteSyncRelationalQuery");
  }
  static [entityKind] = "SQLiteSyncRelationalQuery";
  sync() {
    return this.executeRaw();
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/query-builders/raw.js
var SQLiteRaw = class extends QueryPromise {
  static {
    __name(this, "SQLiteRaw");
  }
  constructor(execute, getSQL, action, dialect, mapBatchResult) {
    super();
    this.execute = execute;
    this.getSQL = getSQL;
    this.dialect = dialect;
    this.mapBatchResult = mapBatchResult;
    this.config = { action };
  }
  static [entityKind] = "SQLiteRaw";
  /** @internal */
  config;
  getQuery() {
    return { ...this.dialect.sqlToQuery(this.getSQL()), method: this.config.action };
  }
  mapResult(result, isFromBatch) {
    return isFromBatch ? this.mapBatchResult(result) : result;
  }
  _prepare() {
    return this;
  }
  /** @internal */
  isResponseInArrayMode() {
    return false;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/db.js
var BaseSQLiteDatabase = class {
  static {
    __name(this, "BaseSQLiteDatabase");
  }
  constructor(resultKind, dialect, session, schema) {
    this.resultKind = resultKind;
    this.dialect = dialect;
    this.session = session;
    this._ = schema ? {
      schema: schema.schema,
      fullSchema: schema.fullSchema,
      tableNamesMap: schema.tableNamesMap
    } : {
      schema: void 0,
      fullSchema: {},
      tableNamesMap: {}
    };
    this.query = {};
    const query = this.query;
    if (this._.schema) {
      for (const [tableName, columns] of Object.entries(this._.schema)) {
        query[tableName] = new RelationalQueryBuilder(
          resultKind,
          schema.fullSchema,
          this._.schema,
          this._.tableNamesMap,
          schema.fullSchema[tableName],
          columns,
          dialect,
          session
        );
      }
    }
    this.$cache = { invalidate: /* @__PURE__ */ __name(async (_params) => {
    }, "invalidate") };
  }
  static [entityKind] = "BaseSQLiteDatabase";
  query;
  /**
   * Creates a subquery that defines a temporary named result set as a CTE.
   *
   * It is useful for breaking down complex queries into simpler parts and for reusing the result set in subsequent parts of the query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
   *
   * @param alias The alias for the subquery.
   *
   * Failure to provide an alias will result in a DrizzleTypeError, preventing the subquery from being referenced in other queries.
   *
   * @example
   *
   * ```ts
   * // Create a subquery with alias 'sq' and use it in the select query
   * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
   *
   * const result = await db.with(sq).select().from(sq);
   * ```
   *
   * To select arbitrary SQL values as fields in a CTE and reference them in other CTEs or in the main query, you need to add aliases to them:
   *
   * ```ts
   * // Select an arbitrary SQL value as a field in a CTE and reference it in the main query
   * const sq = db.$with('sq').as(db.select({
   *   name: sql<string>`upper(${users.name})`.as('name'),
   * })
   * .from(users));
   *
   * const result = await db.with(sq).select({ name: sq.name }).from(sq);
   * ```
   */
  $with = /* @__PURE__ */ __name((alias, selection) => {
    const self = this;
    const as = /* @__PURE__ */ __name((qb) => {
      if (typeof qb === "function") {
        qb = qb(new QueryBuilder(self.dialect));
      }
      return new Proxy(
        new WithSubquery(
          qb.getSQL(),
          selection ?? ("getSelectedFields" in qb ? qb.getSelectedFields() ?? {} : {}),
          alias,
          true
        ),
        new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
      );
    }, "as");
    return { as };
  }, "$with");
  $count(source, filters) {
    return new SQLiteCountBuilder({ source, filters, session: this.session });
  }
  /**
   * Incorporates a previously defined CTE (using `$with`) into the main query.
   *
   * This method allows the main query to reference a temporary named result set.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
   *
   * @param queries The CTEs to incorporate into the main query.
   *
   * @example
   *
   * ```ts
   * // Define a subquery 'sq' as a CTE using $with
   * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
   *
   * // Incorporate the CTE 'sq' into the main query and select from it
   * const result = await db.with(sq).select().from(sq);
   * ```
   */
  with(...queries) {
    const self = this;
    function select(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: self.session,
        dialect: self.dialect,
        withList: queries
      });
    }
    __name(select, "select");
    function selectDistinct(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: self.session,
        dialect: self.dialect,
        withList: queries,
        distinct: true
      });
    }
    __name(selectDistinct, "selectDistinct");
    function update(table) {
      return new SQLiteUpdateBuilder(table, self.session, self.dialect, queries);
    }
    __name(update, "update");
    function insert(into) {
      return new SQLiteInsertBuilder(into, self.session, self.dialect, queries);
    }
    __name(insert, "insert");
    function delete_(from) {
      return new SQLiteDeleteBase(from, self.session, self.dialect, queries);
    }
    __name(delete_, "delete_");
    return { select, selectDistinct, update, insert, delete: delete_ };
  }
  select(fields) {
    return new SQLiteSelectBuilder({ fields: fields ?? void 0, session: this.session, dialect: this.dialect });
  }
  selectDistinct(fields) {
    return new SQLiteSelectBuilder({
      fields: fields ?? void 0,
      session: this.session,
      dialect: this.dialect,
      distinct: true
    });
  }
  /**
   * Creates an update query.
   *
   * Calling this method without `.where()` clause will update all rows in a table. The `.where()` clause specifies which rows should be updated.
   *
   * Use `.set()` method to specify which values to update.
   *
   * See docs: {@link https://orm.drizzle.team/docs/update}
   *
   * @param table The table to update.
   *
   * @example
   *
   * ```ts
   * // Update all rows in the 'cars' table
   * await db.update(cars).set({ color: 'red' });
   *
   * // Update rows with filters and conditions
   * await db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
   *
   * // Update with returning clause
   * const updatedCar: Car[] = await db.update(cars)
   *   .set({ color: 'red' })
   *   .where(eq(cars.id, 1))
   *   .returning();
   * ```
   */
  update(table) {
    return new SQLiteUpdateBuilder(table, this.session, this.dialect);
  }
  $cache;
  /**
   * Creates an insert query.
   *
   * Calling this method will create new rows in a table. Use `.values()` method to specify which values to insert.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert}
   *
   * @param table The table to insert into.
   *
   * @example
   *
   * ```ts
   * // Insert one row
   * await db.insert(cars).values({ brand: 'BMW' });
   *
   * // Insert multiple rows
   * await db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
   *
   * // Insert with returning clause
   * const insertedCar: Car[] = await db.insert(cars)
   *   .values({ brand: 'BMW' })
   *   .returning();
   * ```
   */
  insert(into) {
    return new SQLiteInsertBuilder(into, this.session, this.dialect);
  }
  /**
   * Creates a delete query.
   *
   * Calling this method without `.where()` clause will delete all rows in a table. The `.where()` clause specifies which rows should be deleted.
   *
   * See docs: {@link https://orm.drizzle.team/docs/delete}
   *
   * @param table The table to delete from.
   *
   * @example
   *
   * ```ts
   * // Delete all rows in the 'cars' table
   * await db.delete(cars);
   *
   * // Delete rows with filters and conditions
   * await db.delete(cars).where(eq(cars.color, 'green'));
   *
   * // Delete with returning clause
   * const deletedCar: Car[] = await db.delete(cars)
   *   .where(eq(cars.id, 1))
   *   .returning();
   * ```
   */
  delete(from) {
    return new SQLiteDeleteBase(from, this.session, this.dialect);
  }
  run(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.run(sequel),
        () => sequel,
        "run",
        this.dialect,
        this.session.extractRawRunValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.run(sequel);
  }
  all(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.all(sequel),
        () => sequel,
        "all",
        this.dialect,
        this.session.extractRawAllValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.all(sequel);
  }
  get(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.get(sequel),
        () => sequel,
        "get",
        this.dialect,
        this.session.extractRawGetValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.get(sequel);
  }
  values(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.values(sequel),
        () => sequel,
        "values",
        this.dialect,
        this.session.extractRawValuesValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.values(sequel);
  }
  transaction(transaction, config) {
    return this.session.transaction(transaction, config);
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/cache/core/cache.js
var Cache = class {
  static {
    __name(this, "Cache");
  }
  static [entityKind] = "Cache";
};
var NoopCache = class extends Cache {
  static {
    __name(this, "NoopCache");
  }
  strategy() {
    return "all";
  }
  static [entityKind] = "NoopCache";
  async get(_key) {
    return void 0;
  }
  async put(_hashedQuery, _response, _tables, _config) {
  }
  async onMutate(_params) {
  }
};
async function hashQuery(sql2, params) {
  const dataToHash = `${sql2}-${JSON.stringify(params)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(dataToHash);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
__name(hashQuery, "hashQuery");

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/errors/index.js
var DrizzleQueryError = class _DrizzleQueryError extends Error {
  static {
    __name(this, "DrizzleQueryError");
  }
  constructor(query, params, cause) {
    super(`Failed query: ${query}
params: ${params}`);
    this.query = query;
    this.params = params;
    this.cause = cause;
    Error.captureStackTrace(this, _DrizzleQueryError);
    if (cause) this.cause = cause;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/sqlite-core/session.js
var ExecuteResultSync = class extends QueryPromise {
  static {
    __name(this, "ExecuteResultSync");
  }
  constructor(resultCb) {
    super();
    this.resultCb = resultCb;
  }
  static [entityKind] = "ExecuteResultSync";
  async execute() {
    return this.resultCb();
  }
  sync() {
    return this.resultCb();
  }
};
var SQLitePreparedQuery = class {
  static {
    __name(this, "SQLitePreparedQuery");
  }
  constructor(mode, executeMethod, query, cache, queryMetadata, cacheConfig) {
    this.mode = mode;
    this.executeMethod = executeMethod;
    this.query = query;
    this.cache = cache;
    this.queryMetadata = queryMetadata;
    this.cacheConfig = cacheConfig;
    if (cache && cache.strategy() === "all" && cacheConfig === void 0) {
      this.cacheConfig = { enable: true, autoInvalidate: true };
    }
    if (!this.cacheConfig?.enable) {
      this.cacheConfig = void 0;
    }
  }
  static [entityKind] = "PreparedQuery";
  /** @internal */
  joinsNotNullableMap;
  /** @internal */
  async queryWithCache(queryString, params, query) {
    if (this.cache === void 0 || is(this.cache, NoopCache) || this.queryMetadata === void 0) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (this.cacheConfig && !this.cacheConfig.enable) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if ((this.queryMetadata.type === "insert" || this.queryMetadata.type === "update" || this.queryMetadata.type === "delete") && this.queryMetadata.tables.length > 0) {
      try {
        const [res] = await Promise.all([
          query(),
          this.cache.onMutate({ tables: this.queryMetadata.tables })
        ]);
        return res;
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (!this.cacheConfig) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (this.queryMetadata.type === "select") {
      const fromCache = await this.cache.get(
        this.cacheConfig.tag ?? await hashQuery(queryString, params),
        this.queryMetadata.tables,
        this.cacheConfig.tag !== void 0,
        this.cacheConfig.autoInvalidate
      );
      if (fromCache === void 0) {
        let result;
        try {
          result = await query();
        } catch (e) {
          throw new DrizzleQueryError(queryString, params, e);
        }
        await this.cache.put(
          this.cacheConfig.tag ?? await hashQuery(queryString, params),
          result,
          // make sure we send tables that were used in a query only if user wants to invalidate it on each write
          this.cacheConfig.autoInvalidate ? this.queryMetadata.tables : [],
          this.cacheConfig.tag !== void 0,
          this.cacheConfig.config
        );
        return result;
      }
      return fromCache;
    }
    try {
      return await query();
    } catch (e) {
      throw new DrizzleQueryError(queryString, params, e);
    }
  }
  getQuery() {
    return this.query;
  }
  mapRunResult(result, _isFromBatch) {
    return result;
  }
  mapAllResult(_result, _isFromBatch) {
    throw new Error("Not implemented");
  }
  mapGetResult(_result, _isFromBatch) {
    throw new Error("Not implemented");
  }
  execute(placeholderValues) {
    if (this.mode === "async") {
      return this[this.executeMethod](placeholderValues);
    }
    return new ExecuteResultSync(() => this[this.executeMethod](placeholderValues));
  }
  mapResult(response, isFromBatch) {
    switch (this.executeMethod) {
      case "run": {
        return this.mapRunResult(response, isFromBatch);
      }
      case "all": {
        return this.mapAllResult(response, isFromBatch);
      }
      case "get": {
        return this.mapGetResult(response, isFromBatch);
      }
    }
  }
};
var SQLiteSession = class {
  static {
    __name(this, "SQLiteSession");
  }
  constructor(dialect) {
    this.dialect = dialect;
  }
  static [entityKind] = "SQLiteSession";
  prepareOneTimeQuery(query, fields, executeMethod, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    return this.prepareQuery(
      query,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper,
      queryMetadata,
      cacheConfig
    );
  }
  run(query) {
    const staticQuery = this.dialect.sqlToQuery(query);
    try {
      return this.prepareOneTimeQuery(staticQuery, void 0, "run", false).run();
    } catch (err) {
      throw new DrizzleError({ cause: err, message: `Failed to run the query '${staticQuery.sql}'` });
    }
  }
  /** @internal */
  extractRawRunValueFromBatchResult(result) {
    return result;
  }
  all(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).all();
  }
  /** @internal */
  extractRawAllValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
  get(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).get();
  }
  /** @internal */
  extractRawGetValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
  values(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).values();
  }
  async count(sql2) {
    const result = await this.values(sql2);
    return result[0][0];
  }
  /** @internal */
  extractRawValuesValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
};
var SQLiteTransaction = class extends BaseSQLiteDatabase {
  static {
    __name(this, "SQLiteTransaction");
  }
  constructor(resultType, dialect, session, schema, nestedIndex = 0) {
    super(resultType, dialect, session, schema);
    this.schema = schema;
    this.nestedIndex = nestedIndex;
  }
  static [entityKind] = "SQLiteTransaction";
  rollback() {
    throw new TransactionRollbackError();
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/d1/session.js
var SQLiteD1Session = class extends SQLiteSession {
  static {
    __name(this, "SQLiteD1Session");
  }
  constructor(client, dialect, schema, options = {}) {
    super(dialect);
    this.client = client;
    this.schema = schema;
    this.options = options;
    this.logger = options.logger ?? new NoopLogger();
    this.cache = options.cache ?? new NoopCache();
  }
  static [entityKind] = "SQLiteD1Session";
  logger;
  cache;
  prepareQuery(query, fields, executeMethod, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    const stmt = this.client.prepare(query.sql);
    return new D1PreparedQuery(
      stmt,
      query,
      this.logger,
      this.cache,
      queryMetadata,
      cacheConfig,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper
    );
  }
  async batch(queries) {
    const preparedQueries = [];
    const builtQueries = [];
    for (const query of queries) {
      const preparedQuery = query._prepare();
      const builtQuery = preparedQuery.getQuery();
      preparedQueries.push(preparedQuery);
      if (builtQuery.params.length > 0) {
        builtQueries.push(preparedQuery.stmt.bind(...builtQuery.params));
      } else {
        const builtQuery2 = preparedQuery.getQuery();
        builtQueries.push(
          this.client.prepare(builtQuery2.sql).bind(...builtQuery2.params)
        );
      }
    }
    const batchResults = await this.client.batch(builtQueries);
    return batchResults.map((result, i) => preparedQueries[i].mapResult(result, true));
  }
  extractRawAllValueFromBatchResult(result) {
    return result.results;
  }
  extractRawGetValueFromBatchResult(result) {
    return result.results[0];
  }
  extractRawValuesValueFromBatchResult(result) {
    return d1ToRawMapping(result.results);
  }
  async transaction(transaction, config) {
    const tx = new D1Transaction("async", this.dialect, this, this.schema);
    await this.run(sql.raw(`begin${config?.behavior ? " " + config.behavior : ""}`));
    try {
      const result = await transaction(tx);
      await this.run(sql`commit`);
      return result;
    } catch (err) {
      await this.run(sql`rollback`);
      throw err;
    }
  }
};
var D1Transaction = class _D1Transaction extends SQLiteTransaction {
  static {
    __name(this, "D1Transaction");
  }
  static [entityKind] = "D1Transaction";
  async transaction(transaction) {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new _D1Transaction("async", this.dialect, this.session, this.schema, this.nestedIndex + 1);
    await this.session.run(sql.raw(`savepoint ${savepointName}`));
    try {
      const result = await transaction(tx);
      await this.session.run(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (err) {
      await this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
      throw err;
    }
  }
};
function d1ToRawMapping(results) {
  const rows = [];
  for (const row of results) {
    const entry = Object.keys(row).map((k) => row[k]);
    rows.push(entry);
  }
  return rows;
}
__name(d1ToRawMapping, "d1ToRawMapping");
var D1PreparedQuery = class extends SQLitePreparedQuery {
  static {
    __name(this, "D1PreparedQuery");
  }
  constructor(stmt, query, logger, cache, queryMetadata, cacheConfig, fields, executeMethod, _isResponseInArrayMode, customResultMapper) {
    super("async", executeMethod, query, cache, queryMetadata, cacheConfig);
    this.logger = logger;
    this._isResponseInArrayMode = _isResponseInArrayMode;
    this.customResultMapper = customResultMapper;
    this.fields = fields;
    this.stmt = stmt;
  }
  static [entityKind] = "D1PreparedQuery";
  /** @internal */
  customResultMapper;
  /** @internal */
  fields;
  /** @internal */
  stmt;
  async run(placeholderValues) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return await this.queryWithCache(this.query.sql, params, async () => {
      return this.stmt.bind(...params).run();
    });
  }
  async all(placeholderValues) {
    const { fields, query, logger, stmt, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      const params = fillPlaceholders(query.params, placeholderValues ?? {});
      logger.logQuery(query.sql, params);
      return await this.queryWithCache(query.sql, params, async () => {
        return stmt.bind(...params).all().then(({ results }) => this.mapAllResult(results));
      });
    }
    const rows = await this.values(placeholderValues);
    return this.mapAllResult(rows);
  }
  mapAllResult(rows, isFromBatch) {
    if (isFromBatch) {
      rows = d1ToRawMapping(rows.results);
    }
    if (!this.fields && !this.customResultMapper) {
      return rows;
    }
    if (this.customResultMapper) {
      return this.customResultMapper(rows);
    }
    return rows.map((row) => mapResultRow(this.fields, row, this.joinsNotNullableMap));
  }
  async get(placeholderValues) {
    const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      const params = fillPlaceholders(query.params, placeholderValues ?? {});
      logger.logQuery(query.sql, params);
      return await this.queryWithCache(query.sql, params, async () => {
        return stmt.bind(...params).all().then(({ results }) => results[0]);
      });
    }
    const rows = await this.values(placeholderValues);
    if (!rows[0]) {
      return void 0;
    }
    if (customResultMapper) {
      return customResultMapper(rows);
    }
    return mapResultRow(fields, rows[0], joinsNotNullableMap);
  }
  mapGetResult(result, isFromBatch) {
    if (isFromBatch) {
      result = d1ToRawMapping(result.results)[0];
    }
    if (!this.fields && !this.customResultMapper) {
      return result;
    }
    if (this.customResultMapper) {
      return this.customResultMapper([result]);
    }
    return mapResultRow(this.fields, result, this.joinsNotNullableMap);
  }
  async values(placeholderValues) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return await this.queryWithCache(this.query.sql, params, async () => {
      return this.stmt.bind(...params).raw();
    });
  }
  /** @internal */
  isResponseInArrayMode() {
    return this._isResponseInArrayMode;
  }
};

// node_modules/.pnpm/drizzle-orm@0.44.2/node_modules/drizzle-orm/d1/driver.js
var DrizzleD1Database = class extends BaseSQLiteDatabase {
  static {
    __name(this, "DrizzleD1Database");
  }
  static [entityKind] = "D1Database";
  async batch(batch) {
    return this.session.batch(batch);
  }
};
function drizzle(client, config = {}) {
  const dialect = new SQLiteAsyncDialect({ casing: config.casing });
  let logger;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }
  let schema;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(
      config.schema,
      createTableRelationsHelpers
    );
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap
    };
  }
  const session = new SQLiteD1Session(client, dialect, schema, { logger, cache: config.cache });
  const db2 = new DrizzleD1Database("async", dialect, session, schema);
  db2.$client = client;
  db2.$cache = config.cache;
  if (db2.$cache) {
    db2.$cache["invalidate"] = config.cache?.onMutate;
  }
  return db2;
}
__name(drizzle, "drizzle");

// src/service/d1/schema.ts
var schema_exports = {};
__export(schema_exports, {
  keys: () => keys
});
var keys = sqliteTable(
  "keys",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    key: text("key").notNull(),
    provider: text("provider").notNull(),
    modelCoolings: text("model_coolings", { mode: "json" }).$type(),
    totalCoolingSeconds: integer("total_cooling_seconds").notNull().default(0),
    // across all models, in seconds
    status: text("status").notNull().default("active"),
    // active, blocked
    remark: text("remark"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`)
  },
  (table) => {
    return {
      providerKeyUnqIdx: uniqueIndex("provider_key_unq_idx").on(table.provider, table.key),
      providerStatusCreatedAtIdx: index("provider_status_created_at_idx").on(table.provider, table.status, table.createdAt),
      totalCoolingSecondsIdx: index("total_cooling_seconds_idx").on(table.totalCoolingSeconds)
    };
  }
);

// src/service/d1/index.ts
function db(env) {
  return drizzle(env.DB, { schema: schema_exports });
}
__name(db, "db");

// src/service/key.ts
var activeKeysCacheByProvider = /* @__PURE__ */ new Map();
var cacheMaxAgeSeconds = 60;
async function listActiveKeysViaCache(env, provider) {
  const now = Date.now() / 1e3;
  const cache = activeKeysCacheByProvider.get(provider);
  if (cache && now - cache.updatedAt < cacheMaxAgeSeconds && !cache.isDirty) {
    return cache.data;
  }
  const keys2 = await db(env).query.keys.findMany({
    columns: {
      id: true,
      key: true,
      modelCoolings: true
    },
    where: and(eq(keys.status, "active"), eq(keys.provider, provider)),
    orderBy: sql`RANDOM()`,
    limit: 1e3
  });
  activeKeysCacheByProvider.set(provider, {
    data: keys2,
    updatedAt: now,
    isDirty: false
  });
  console.info(`cache refreshed for ${provider}: ${keys2.length} keys`);
  return keys2;
}
__name(listActiveKeysViaCache, "listActiveKeysViaCache");
async function setKeyStatus(env, provider, keyId, status) {
  await db(env).update(keys).set({ status }).where(eq(keys.id, keyId));
  const cache = activeKeysCacheByProvider.get(provider);
  if (cache) {
    cache.isDirty = true;
  }
}
__name(setKeyStatus, "setKeyStatus");
async function setKeyModelCooldownIfAvailable(env, keyId, provider, model, sec) {
  const now = Date.now() / 1e3;
  const newCooldownEndAt = Math.round(now + sec);
  const modelKey = model.replace(/"/g, '""');
  const modelPath = `$."${modelKey}"`;
  const endAtPath = `$."${modelKey}".end_at`;
  const totalSecondsPath = `$."${modelKey}".total_seconds`;
  const result = await db(env).update(keys).set({
    modelCoolings: sql`json_set(
                COALESCE(${keys.modelCoolings}, '{}'),
                ${modelPath},
                json_object(
                    'end_at',
                    ${newCooldownEndAt},
                    'total_seconds',
                    COALESCE(CAST(json_extract(${keys.modelCoolings}, ${totalSecondsPath}) AS INTEGER), 0) + ${sec}
                )
            )`,
    totalCoolingSeconds: sql`${keys.totalCoolingSeconds} + ${sec}`
  }).where(
    and(
      eq(keys.id, keyId),
      or(
        sql`json_extract(${keys.modelCoolings}, ${endAtPath}) IS NULL`,
        // if key is already cooling down, do nothing,
        // otherwise may wrong extend the recovery time (cache consistency may cause multiple calls)
        sql`json_extract(${keys.modelCoolings}, ${endAtPath}) <= ${now}`
      )
    )
  ).returning({ updatedId: keys.id });
  if (result.length > 0) {
    const cache = activeKeysCacheByProvider.get(provider);
    if (cache) {
      cache.isDirty = true;
    }
  }
}
__name(setKeyModelCooldownIfAvailable, "setKeyModelCooldownIfAvailable");
async function listKeys(env, provider, status, q, page, pageSize, sortBy, sortOrder) {
  const db2 = db(env);
  const conditions = [eq(keys.provider, provider), eq(keys.status, status)];
  if (q) {
    conditions.push(
      or(like(keys.key, `%${q}%`), like(keys.remark, `%${q}%`))
    );
  }
  const where = and(...conditions);
  const totalResult = await db2.select({ count: count() }).from(keys).where(where);
  const total = totalResult[0]?.count || 0;
  if (total === 0) {
    return { keys: [], total: 0 };
  }
  let orderBy;
  if (sortBy === "createdAt") {
    orderBy = sortOrder === "asc" ? asc(keys.createdAt) : desc(keys.createdAt);
  } else if (sortBy === "totalCoolingSeconds") {
    orderBy = sortOrder === "asc" ? asc(keys.totalCoolingSeconds) : desc(keys.totalCoolingSeconds);
  } else {
    orderBy = desc(keys.createdAt);
  }
  const keys2 = await db2.query.keys.findMany({
    where,
    orderBy,
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  return { keys: keys2, total };
}
__name(listKeys, "listKeys");
async function addKeys(env, keys2) {
  if (keys2.length === 0) {
    return;
  }
  const db2 = db(env);
  const chunkSize = 15;
  for (let i = 0; i < keys2.length; i += chunkSize) {
    const chunk = keys2.slice(i, i + chunkSize);
    await db2.insert(keys).values(chunk).onConflictDoNothing();
  }
}
__name(addKeys, "addKeys");
async function delKeys(env, keyIds) {
  if (keyIds.length === 0) {
    return;
  }
  await db(env).delete(keys).where(inArray(keys.id, keyIds));
}
__name(delKeys, "delKeys");
async function delKeysByStatus(env, provider, status) {
  await db(env).delete(keys).where(and(eq(keys.provider, provider), eq(keys.status, status)));
}
__name(delKeysByStatus, "delKeysByStatus");

// src/util.ts
var parseCache = /* @__PURE__ */ new Map();
function parseAuthKeys(authKeysStr) {
  if (parseCache.has(authKeysStr)) {
    return parseCache.get(authKeysStr);
  }
  if (!authKeysStr) {
    const result = [];
    parseCache.set(authKeysStr, result);
    return result;
  }
  const keys2 = [];
  const keyDefinitions = authKeysStr.split(";").map((s) => s.trim());
  for (const definition of keyDefinitions) {
    if (!definition) continue;
    const parts = definition.split("=");
    const keyPart = parts[0];
    const permissionsPart = parts.length > 1 ? parts[1] : null;
    const keyMatch = keyPart.match(/^([^()]+)(?:\((\d+)\))?$/);
    if (!keyMatch) continue;
    const key = keyMatch[1];
    const expiresAt = keyMatch[2] ? parseInt(keyMatch[2], 10) : void 0;
    if (!permissionsPart) {
      keys2.push({ key, unrestricted: true, expiresAt });
      continue;
    }
    const allowed = {
      providers: /* @__PURE__ */ new Set(),
      models: /* @__PURE__ */ new Set()
    };
    const providersAndModels = permissionsPart.split("&");
    for (const pm of providersAndModels) {
      const [provider, ...models] = pm.split(",");
      if (provider) {
        allowed.providers.add(provider);
      }
      if (models.length > 0) {
        models.forEach((m) => allowed.models.add(m));
      }
    }
    keys2.push({ key, unrestricted: false, allowed, expiresAt });
  }
  parseCache.set(authKeysStr, keys2);
  return keys2;
}
__name(parseAuthKeys, "parseAuthKeys");
function findAuthKey(toCheck, parsedKeys) {
  const now = Date.now() / 1e3;
  for (const authKey of parsedKeys) {
    if (authKey.key === toCheck) {
      if (authKey.expiresAt && authKey.expiresAt < now) {
        return void 0;
      }
      return authKey;
    }
  }
  return void 0;
}
__name(findAuthKey, "findAuthKey");
function isApiAllowed(authKey, provider, model) {
  if (authKey.unrestricted) {
    return true;
  }
  if (!authKey.allowed) {
    return false;
  }
  const { providers, models } = authKey.allowed;
  if (providers.size > 0 && !providers.has(provider)) {
    return false;
  }
  if (models.size > 0 && !models.has(model)) {
    return false;
  }
  return true;
}
__name(isApiAllowed, "isApiAllowed");
function isWebUiAllowed(authKey) {
  return authKey.unrestricted;
}
__name(isWebUiAllowed, "isWebUiAllowed");
function isApiRequestAllowed(authKey, authKeysStr, provider, model) {
  if (!authKey || !authKeysStr) {
    return false;
  }
  const parsedKeys = parseAuthKeys(authKeysStr);
  const foundKey = findAuthKey(authKey, parsedKeys);
  if (!foundKey) {
    return false;
  }
  return isApiAllowed(foundKey, provider, model);
}
__name(isApiRequestAllowed, "isApiRequestAllowed");
function isWebUiRequestAllowed(authKey, authKeysStr) {
  if (!authKey || !authKeysStr) {
    return false;
  }
  const parsedKeys = parseAuthKeys(authKeysStr);
  const foundKey = findAuthKey(authKey, parsedKeys);
  if (!foundKey) {
    return false;
  }
  return isWebUiAllowed(foundKey);
}
__name(isWebUiRequestAllowed, "isWebUiRequestAllowed");
function getSecondsUntilMidnightPT() {
  const now = /* @__PURE__ */ new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const second = parseInt(parts.find((p) => p.type === "second")?.value || "0", 10);
  const secondsPassed = hour * 3600 + minute * 60 + second;
  return 24 * 60 * 60 - secondsPassed;
}
__name(getSecondsUntilMidnightPT, "getSecondsUntilMidnightPT");
function getSecondsUntilMidnightUTC() {
  const now = /* @__PURE__ */ new Date();
  const utcMidnight = new Date(now);
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() + 1);
  utcMidnight.setUTCHours(0, 0, 0, 0);
  return Math.floor((utcMidnight.getTime() - now.getTime()) / 1e3);
}
__name(getSecondsUntilMidnightUTC, "getSecondsUntilMidnightUTC");

// src/api.ts
var PROVIDER_CUSTOM_AUTH_HEADER = {
  "google-ai-studio": "x-goog-api-key",
  anthropic: "x-api-key",
  elevenlabs: "x-api-key",
  "azure-openai": "api-key",
  cartesia: "X-API-Key"
};
function getAuthHeaderName(provider) {
  return PROVIDER_CUSTOM_AUTH_HEADER[provider] || "Authorization";
}
__name(getAuthHeaderName, "getAuthHeaderName");
async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const restResource = url.pathname.substring("/api/".length) + url.search;
  if (restResource.startsWith("keys/")) {
    return handleKeys(request, env);
  }
  const provider = restResource.split("/")[0];
  const authKey = getAuthKey(request, provider);
  const realProviderAndModel = await extractRealProviderAndModel(request, restResource, provider);
  if (!realProviderAndModel) {
    return new Response("Not supported request: valid provider or model not found", { status: 400 });
  }
  if (!isApiRequestAllowed(authKey, env.AUTH_KEY, realProviderAndModel.provider, realProviderAndModel.model)) {
    return new Response("Invalid auth key", { status: 403 });
  }
  return await forward(request, env, ctx, restResource, realProviderAndModel.provider, realProviderAndModel.model);
}
__name(handle, "handle");
function checkKeyManagerAuth(request, env) {
  const token = env.KEY_MANAGER_TOKEN;
  if (!token) {
    return new Response("KEY_MANAGER_TOKEN not configured", { status: 500 });
  }
  const auth = request.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
__name(checkKeyManagerAuth, "checkKeyManagerAuth");
async function handleKeys(request, env) {
  const authError = checkKeyManagerAuth(request, env);
  if (authError) return authError;
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/keys/next" && request.method === "GET") {
    return handleKeysNext(request, env);
  }
  const statusMatch = path.match(/^\/api\/keys\/(.+)\/status$/);
  if (statusMatch && request.method === "POST") {
    return handleKeysStatus(request, env, statusMatch[1]);
  }
  return new Response("Not found", { status: 404 });
}
__name(handleKeys, "handleKeys");
async function handleKeysNext(request, env) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const model = url.searchParams.get("model");
  if (!provider || !model) {
    return new Response("provider and model query params required", { status: 400 });
  }
  const activeKeys = await listActiveKeysViaCache(env, provider);
  if (activeKeys.length === 0) {
    return new Response("No active keys available", { status: 503 });
  }
  const selectedKey = await selectKey(activeKeys, model);
  const cooling = selectedKey.modelCoolings?.[model];
  const coolingUntil = cooling && cooling.end_at > Date.now() / 1e3 ? cooling.end_at : null;
  return new Response(JSON.stringify({
    key: selectedKey.key,
    id: selectedKey.id,
    cooling_until: coolingUntil
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleKeysNext, "handleKeysNext");
async function handleKeysStatus(request, env, keyId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (body.blocked) {
    const provider = body.provider ?? "google-ai-studio";
    await setKeyStatus(env, provider, keyId, "blocked");
    return new Response("OK", { status: 200 });
  }
  if (body.rate_limited && body.retry_after) {
    const provider = body.provider ?? "google-ai-studio";
    const model = body.model ?? "";
    if (!model) {
      return new Response("model required for rate_limited", { status: 400 });
    }
    await setKeyModelCooldownIfAvailable(env, keyId, provider, model, body.retry_after);
    return new Response("OK", { status: 200 });
  }
  if (body.ok) {
    return new Response("OK", { status: 200 });
  }
  return new Response("Invalid status body: one of ok, blocked, rate_limited required", { status: 400 });
}
__name(handleKeysStatus, "handleKeysStatus");
async function extractRealProviderAndModel(request, restResource, provider) {
  const model = await extractModel(request, restResource);
  if (!model) {
    return null;
  }
  if (provider !== "compat") {
    return { provider, model };
  }
  const realProvider = model.split("/")[0];
  if (!realProvider) {
    return null;
  }
  const realModel = model.split("/")[1];
  if (!realModel) {
    return null;
  }
  return { provider: realProvider, model: realModel };
}
__name(extractRealProviderAndModel, "extractRealProviderAndModel");
async function extractModel(request, restResource) {
  if (request.method === "POST" && request.body) {
    const model = await extractModelFromBody(request);
    if (model) return model;
  }
  return extractModelFromPath(restResource);
}
__name(extractModel, "extractModel");
async function extractModelFromBody(request) {
  try {
    const body = await request.clone().json();
    return body.model || null;
  } catch {
    return null;
  }
}
__name(extractModelFromBody, "extractModelFromBody");
function extractModelFromPath(restResource) {
  const parts = restResource.split("/models/");
  if (parts.length > 1) {
    return parts[1].split(":")[0];
  }
  return null;
}
__name(extractModelFromPath, "extractModelFromPath");
async function forward(request, env, ctx, restResource, provider, model) {
  const activeKeys = await listActiveKeysViaCache(env, provider);
  if (activeKeys.length === 0) {
    return new Response("No active keys available", { status: 503 });
  }
  const body = request.body ? await request.arrayBuffer() : null;
  const MAX_RETRIES = 30;
  for (let i = 0; i < MAX_RETRIES; i++) {
    if (activeKeys.length === 0) {
      return new Response("No active keys available", { status: 503 });
    }
    const selectedKey = await selectKey(activeKeys, model);
    const reqToGateway = await makeGatewayRequest(
      request.method,
      request.headers,
      body,
      env,
      restResource,
      selectedKey.key
    );
    const respFromGateway = await fetch(reqToGateway);
    const status = respFromGateway.status;
    switch (status) {
      // try block
      case 400:
        if (!await keyIsInvalid(respFromGateway, provider)) {
          return respFromGateway;
        }
      // key is invalid, then continue to block and next key
      case 401:
      case 403:
        ctx.waitUntil(setKeyStatus(env, provider, selectedKey.id, "blocked"));
        console.error(
          `key ${selectedKey.key} is blocked due to ${respFromGateway.status} ${await respFromGateway.text()}`
        );
        if (activeKeys.length < 500) {
          activeKeys.splice(activeKeys.indexOf(selectedKey), 1);
        }
        continue;
      // try cooling down
      case 429:
        const sec = await analyze429CooldownSeconds(env, respFromGateway, provider, selectedKey.key);
        ctx.waitUntil(setKeyModelCooldownIfAvailable(env, selectedKey.id, provider, model, sec));
        console.warn(
          `key ${selectedKey.key} is cooling down for model ${model} due to 429 ${await respFromGateway.text()}`
        );
        if (activeKeys.length < 500) {
          activeKeys.splice(activeKeys.indexOf(selectedKey), 1);
        }
        continue;
      case 500:
      case 502:
      case 503:
      case 504:
        console.error(`gateway returned 5xx ${await respFromGateway.text()}`);
        continue;
    }
    if (status / 100 === 2) {
      consecutive429Count.delete(selectedKey.id);
    } else {
      console.error(`gateway returned ${status}`);
    }
    return respFromGateway;
  }
  return new Response("Internal server error after retries", { status: 500 });
}
__name(forward, "forward");
function getAuthKey(request, provider) {
  if (provider === "google-ai-studio") {
    const key = new URL(request.url).searchParams.get("key");
    if (key) {
      return key;
    }
  }
  return getAuthKeyFromHeader(request, provider);
}
__name(getAuthKey, "getAuthKey");
function getAuthKeyFromHeader(request, provider) {
  const h = getAuthHeaderName(provider);
  let v = request.headers.get(h);
  if (!v) {
    return "";
  }
  let key = v;
  if (h === "Authorization") {
    key = v.replace(/^Bearer\s+/, "");
  }
  return key;
}
__name(getAuthKeyFromHeader, "getAuthKeyFromHeader");
async function selectKey(keys2, model) {
  let selectedKey = tryRandomSelect(keys2, model);
  if (selectedKey) {
    return selectedKey;
  }
  return selectFromAllKeys(keys2, model);
}
__name(selectKey, "selectKey");
function tryRandomSelect(keys2, model) {
  const now = Date.now() / 1e3;
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const randomKey = keys2[Math.floor(Math.random() * keys2.length)];
    const coolingEnd = randomKey.modelCoolings?.[model]?.end_at;
    if (!coolingEnd || coolingEnd < now) {
      console.info(`selected a key ${randomKey.key} to try; count: ${i + 1}`);
      return randomKey;
    }
  }
  return null;
}
__name(tryRandomSelect, "tryRandomSelect");
function selectFromAllKeys(keys2, model) {
  const now = Date.now() / 1e3;
  const availableKeys = [];
  let bestCoolingKey = null;
  let earliestCooldownEnd = Infinity;
  for (const key of keys2) {
    const coolingEnd = key.modelCoolings?.[model]?.end_at;
    if (!coolingEnd || coolingEnd < now) {
      availableKeys.push(key);
    } else if (coolingEnd < earliestCooldownEnd) {
      earliestCooldownEnd = coolingEnd;
      bestCoolingKey = key;
    }
  }
  if (availableKeys.length > 0) {
    const selectedKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    console.info(`selected available key ${selectedKey.key} after full scan`);
    return selectedKey;
  }
  console.warn(`selected a cooling key ${bestCoolingKey?.key} to try`);
  return bestCoolingKey;
}
__name(selectFromAllKeys, "selectFromAllKeys");
async function makeGatewayRequest(method, headers, body, env, restResource, key) {
  const newHeaders = new Headers(headers);
  setAuthHeader(newHeaders, restResource, key);
  const selected = selectGateway(env);
  let base = await env.AI.gateway(selected).getUrl();
  if (!base.endsWith("/")) {
    base += "/";
  }
  const url = `${base}${restResource}`;
  return new Request(url, {
    method,
    headers: newHeaders,
    body,
    redirect: "follow"
  });
}
__name(makeGatewayRequest, "makeGatewayRequest");
function selectGateway(env) {
  const gateways = env.AI_GATEWAY.split(",").map((s) => s.trim());
  const selected = gateways[Math.floor(Math.random() * gateways.length)];
  console.info(`selected gateway ${selected}`);
  return selected;
}
__name(selectGateway, "selectGateway");
function setAuthHeader(headers, restResource, key) {
  const provider = restResource.split("/")[0];
  let v = key;
  const h = getAuthHeaderName(provider);
  if (h == "Authorization") {
    v = `Bearer ${key}`;
  }
  headers.set(h, v);
}
__name(setAuthHeader, "setAuthHeader");
async function keyIsInvalid(respFromGateway, provider) {
  if (provider !== "google-ai-studio") {
    return false;
  }
  if (respFromGateway.status !== 400) {
    return false;
  }
  try {
    const body = await respFromGateway.clone().json();
    const detail = getGoogleAiStudioErrorDetail(body, "type.googleapis.com/google.rpc.ErrorInfo");
    return detail?.reason === "API_KEY_INVALID";
  } catch {
    return false;
  }
}
__name(keyIsInvalid, "keyIsInvalid");
var consecutive429Count = /* @__PURE__ */ new Map();
async function analyze429CooldownSeconds(env, respFromGateway, provider, key) {
  const count2 = (consecutive429Count.get(key) || 0) + 1;
  consecutive429Count.set(key, count2);
  if (count2 >= Number(env.CONSECUTIVE_429_THRESHOLD)) {
    consecutive429Count.delete(key);
    console.error(`key ${key} triggered long cooldown after ${env.CONSECUTIVE_429_THRESHOLD} consecutive 429s`);
    return untilResetForDay(provider);
  }
  return untilReset(respFromGateway, provider);
}
__name(analyze429CooldownSeconds, "analyze429CooldownSeconds");
function untilResetForDay(provider) {
  if (provider === "google-ai-studio") {
    return getSecondsUntilMidnightPT();
  }
  if (provider === "openrouter") {
    return getSecondsUntilMidnightUTC();
  }
  return 24 * 60 * 60;
}
__name(untilResetForDay, "untilResetForDay");
async function untilReset(respFromGateway, provider) {
  if (provider === "google-ai-studio") {
    return untilResetForGoogleAiStudio(respFromGateway);
  }
  if (provider === "openrouter") {
    return untilResetForOpenrouter(respFromGateway);
  }
  return 65;
}
__name(untilReset, "untilReset");
async function untilResetForGoogleAiStudio(respFromGateway) {
  try {
    const errorBody = await respFromGateway.clone().json();
    const quotaFailureDetail = getGoogleAiStudioErrorDetail(
      errorBody,
      "type.googleapis.com/google.rpc.QuotaFailure"
    );
    if (quotaFailureDetail) {
      const violations = quotaFailureDetail.violations || [];
      for (const violation of violations) {
        if (violation.quotaId === "GenerateRequestsPerDayPerProjectPerModel-FreeTier") {
          return getSecondsUntilMidnightPT();
        }
      }
    }
    const retryInfoDetail = getGoogleAiStudioErrorDetail(errorBody, "type.googleapis.com/google.rpc.RetryInfo");
    if (retryInfoDetail && retryInfoDetail.retryDelay) {
      const retrySeconds = parseInt(retryInfoDetail.retryDelay.replace("s", ""));
      return retrySeconds + 2;
    }
  } catch (error) {
    console.error("failed to parse google-ai-studio 429 response, fallback to 65 seconds", error);
  }
  return 65;
}
__name(untilResetForGoogleAiStudio, "untilResetForGoogleAiStudio");
async function untilResetForOpenrouter(respFromGateway) {
  try {
    const resetHeader = respFromGateway.headers.get("X-RateLimit-Reset");
    if (resetHeader) {
      const resetTime = parseInt(resetHeader);
      const now = Date.now();
      if (resetTime > now) {
        const cooldownSeconds = Math.floor((resetTime - now) / 1e3) + 5;
        return cooldownSeconds;
      }
    }
  } catch (error) {
    console.error("failed to parse openrouter 429 response, fallback to 65 seconds", error);
  }
  return 65;
}
__name(untilResetForOpenrouter, "untilResetForOpenrouter");
function getGoogleAiStudioErrorDetail(body, type) {
  let errorBody = body;
  if (Array.isArray(body) && body.length > 0) {
    errorBody = body[0];
  }
  const details = errorBody.error?.details || [];
  for (const detail of details) {
    if (detail["@type"] === type) {
      return detail;
    }
  }
  return null;
}
__name(getGoogleAiStudioErrorDetail, "getGoogleAiStudioErrorDetail");

// src/web.ts
var PROVIDER_CONFIGS = {
  "google-ai-studio": { color: "from-red-400 to-yellow-400", icon: "G", bgColor: "from-red-50 to-yellow-50" },
  "google-vertex-ai": { color: "from-blue-400 to-green-400", icon: "\u25B2", bgColor: "from-blue-50 to-green-50" },
  anthropic: { color: "from-orange-400 to-red-400", icon: "A", bgColor: "from-orange-50 to-red-50" },
  "azure-openai": { color: "from-blue-500 to-cyan-400", icon: "\u229E", bgColor: "from-blue-50 to-cyan-50" },
  "aws-bedrock": { color: "from-yellow-500 to-orange-500", icon: "\u25C6", bgColor: "from-yellow-50 to-orange-50" },
  cartesia: { color: "from-purple-400 to-pink-400", icon: "C", bgColor: "from-purple-50 to-pink-50" },
  cerebras: { color: "from-gray-600 to-gray-800", icon: "\u25C9", bgColor: "from-gray-50 to-gray-100" },
  cohere: { color: "from-green-400 to-teal-500", icon: "\u25CF", bgColor: "from-green-50 to-teal-50" },
  deepseek: { color: "from-indigo-500 to-purple-600", icon: "\u25C8", bgColor: "from-indigo-50 to-purple-50" },
  elevenlabs: { color: "from-pink-400 to-rose-500", icon: "\u266B", bgColor: "from-pink-50 to-rose-50" },
  grok: { color: "from-gray-700 to-black", icon: "X", bgColor: "from-gray-50 to-gray-100" },
  groq: { color: "from-orange-500 to-red-600", icon: "\u26A1", bgColor: "from-orange-50 to-red-50" },
  huggingface: { color: "from-yellow-400 to-amber-500", icon: "\u{1F917}", bgColor: "from-yellow-50 to-amber-50" },
  mistral: { color: "from-blue-600 to-indigo-700", icon: "M", bgColor: "from-blue-50 to-indigo-50" },
  openai: { color: "from-emerald-400 to-teal-600", icon: "\u25EF", bgColor: "from-emerald-50 to-teal-50" },
  openrouter: { color: "from-violet-500 to-purple-600", icon: "\u27F2", bgColor: "from-violet-50 to-purple-50" },
  "perplexity-ai": { color: "from-cyan-500 to-blue-600", icon: "?", bgColor: "from-cyan-50 to-blue-50" },
  replicate: { color: "from-slate-500 to-gray-600", icon: "\u29C9", bgColor: "from-slate-50 to-gray-50" }
};
var PROVIDERS = Object.keys(PROVIDER_CONFIGS);
async function handle2(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname === "/login" && request.method === "POST") {
    return handleLogin(request, env);
  }
  if (pathname.startsWith("/keys") || pathname === "/") {
    return handleKeys2(request, env);
  }
  return new Response("Not Found", { status: 404 });
}
__name(handle2, "handle");
async function handleLogin(request, env) {
  const formData = await request.formData();
  const key = formData.get("auth_key");
  if (isWebUiRequestAllowed(key, env.AUTH_KEY)) {
    const headers = new Headers();
    headers.set("Set-Cookie", `auth_key=${key}; HttpOnly; Path=/; SameSite=Strict; Max-Age=2147483647`);
    headers.set("Location", "/keys");
    return new Response(null, { status: 302, headers });
  }
  return new Response("Invalid key", { status: 403 });
}
__name(handleLogin, "handleLogin");
async function handleKeys2(request, env) {
  const authResult = checkAuth(request, env);
  if (authResult) {
    return authResult;
  }
  const parseResult = parseKeysRequest(request);
  if (!parseResult.provider) {
    return new Response(providersPage(), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
  }
  if (request.method === "POST") {
    return await handleKeysPost(request, env, parseResult);
  }
  return await handleKeysGet(env, parseResult);
}
__name(handleKeys2, "handleKeys");
function checkAuth(request, env) {
  const cookie = request.headers.get("Cookie");
  const authKey = cookie?.match(/auth_key=([^;]+)/)?.[1];
  if (!isWebUiRequestAllowed(authKey, env.AUTH_KEY)) {
    return new Response(loginPage(), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
  }
  return null;
}
__name(checkAuth, "checkAuth");
function parseKeysRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const providerMatch = pathname.match(/^\/keys\/([a-zA-Z0-9_-]+)/);
  return {
    provider: providerMatch?.[1] || "",
    q: url.searchParams.get("q") || "",
    status: url.searchParams.get("status") || "active",
    page: parseInt(url.searchParams.get("page") || "1", 10),
    pageSize: 20,
    sortBy: url.searchParams.get("sort_by") || "",
    sortOrder: url.searchParams.get("sort_order") || "desc"
  };
}
__name(parseKeysRequest, "parseKeysRequest");
async function handleKeysPost(request, env, params) {
  const formData = await request.formData();
  const action = formData.get("action");
  if (action === "add") {
    const keysStr = formData.get("keys");
    const remark = formData.get("remark");
    const keys2 = keysStr.split(/[\n,]/).map((k) => k.trim()).filter(Boolean);
    await addKeys(
      env,
      keys2.map((key) => ({ key, provider: params.provider, remark }))
    );
  } else if (action === "delete") {
    const keyIds = formData.getAll("key_id");
    await delKeys(env, keyIds);
  } else if (action === "delete-all-blocked") {
    await delKeysByStatus(env, params.provider, "blocked");
  } else if (action === "delete-all-active") {
    await delKeysByStatus(env, params.provider, "active");
  }
  const redirectParams = new URLSearchParams();
  redirectParams.set("status", params.status);
  if (params.q) {
    redirectParams.set("q", params.q);
  }
  if (params.sortBy) {
    redirectParams.set("sort_by", params.sortBy);
    redirectParams.set("sort_order", params.sortOrder);
  }
  const headers = new Headers({ Location: `/keys/${params.provider}?${redirectParams.toString()}` });
  return new Response(null, { status: 303, headers });
}
__name(handleKeysPost, "handleKeysPost");
async function handleKeysGet(env, params) {
  const { keys: keys2, total } = await listKeys(
    env,
    params.provider,
    params.status,
    params.q,
    params.page,
    params.pageSize,
    params.sortBy,
    params.sortOrder
  );
  return new Response(
    keysListPage(
      params.provider,
      params.status,
      params.q,
      keys2,
      total,
      params.page,
      params.pageSize,
      params.sortBy,
      params.sortOrder
    ),
    {
      headers: { "Content-Type": "text/html;charset=UTF-8" }
    }
  );
}
__name(handleKeysGet, "handleKeysGet");
function layout(content) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>One Balance</title>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>\u2696\uFE0F</text></svg>">
        <script src="https://cdn.tailwindcss.com"><\/script>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            .breathing-bg {
                background: linear-gradient(-45deg, #f8fafc, #e2e8f0, #cbd5e1, #f1f5f9);
                background-size: 400% 400%;
                animation: breathe 8s ease-in-out infinite;
            }
            
            @keyframes breathe {
                0%, 100% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
            }
            
            .glass-card {
                backdrop-filter: blur(24px);
                -webkit-backdrop-filter: blur(24px);
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%);
                border: 1px solid rgba(255, 255, 255, 0.4);
                box-shadow: 
                    0 8px 32px rgba(0, 0, 0, 0.08),
                    0 4px 16px rgba(0, 0, 0, 0.04),
                    inset 0 1px 0 rgba(255, 255, 255, 0.6);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .glass-card:hover {
                transform: translateY(-4px) scale(1.01);
                box-shadow: 
                    0 20px 60px rgba(0, 0, 0, 0.12),
                    0 8px 24px rgba(0, 0, 0, 0.08),
                    inset 0 1px 0 rgba(255, 255, 255, 0.8);
            }
            
            .glass-card-warm {
                background: linear-gradient(135deg, rgba(254, 249, 239, 0.9) 0%, rgba(255, 251, 235, 0.7) 100%);
                border: 1px solid rgba(251, 191, 36, 0.2);
                box-shadow: 
                    0 8px 32px rgba(251, 191, 36, 0.08),
                    0 4px 16px rgba(251, 191, 36, 0.04),
                    inset 0 1px 0 rgba(255, 255, 255, 0.8);
            }
            
            .btn-primary {
                background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 50%, #2563eb 100%);
                box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
            }
            
            .btn-primary::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                transition: left 0.5s;
            }
            
            .btn-primary:hover::before {
                left: 100%;
            }
            
            .btn-primary:hover {
                background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%);
                transform: translateY(-2px);
                box-shadow: 0 12px 32px rgba(59, 130, 246, 0.4);
            }
            
            .input-field {
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(248, 250, 252, 0.6) 100%);
                border: 1px solid rgba(203, 213, 225, 0.4);
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
                transition: all 0.3s ease;
            }
            
            .input-field:focus {
                background: rgba(255, 255, 255, 0.95);
                border-color: #3b82f6;
                box-shadow: 
                    0 0 0 3px rgba(59, 130, 246, 0.1),
                    inset 0 2px 4px rgba(0, 0, 0, 0.02),
                    0 4px 12px rgba(59, 130, 246, 0.1);
            }
            
            .floating-element {
                animation: float 6s ease-in-out infinite;
            }
            
            @keyframes float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-10px); }
            }
            
            .pulse-glow {
                animation: pulse-glow 3s ease-in-out infinite;
            }
            
            @keyframes pulse-glow {
                0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.1); }
                50% { box-shadow: 0 0 40px rgba(59, 130, 246, 0.2); }
            }

            .copy-success {
                animation: copy-flash 0.6s ease-out;
            }
            
            @keyframes copy-flash {
                0% { background-color: rgba(34, 197, 94, 0.1); }
                50% { background-color: rgba(34, 197, 94, 0.2); }
                100% { background-color: transparent; }
            }
        </style>
        <script>
            function copyToClipboard(text, element) {
                navigator.clipboard.writeText(text).then(function() {
                    const tooltip = element.parentElement.querySelector('.copy-tooltip');
                    const originalBg = element.className;
                    
                    element.className = originalBg.replace('bg-gray-100', 'bg-green-100').replace('border-gray-200', 'border-green-300');
                    tooltip.classList.remove('opacity-0');
                    tooltip.classList.add('opacity-100');
                    
                    setTimeout(function() {
                        element.className = originalBg;
                        tooltip.classList.remove('opacity-100');
                        tooltip.classList.add('opacity-0');
                    }, 1500);
                }).catch(function() {
                    console.error('Failed to copy text');
                });
            }
        <\/script>
    </head>
    <body class="breathing-bg min-h-screen text-gray-900 flex flex-col">
        <main class="container mx-auto mt-12 px-6 max-w-7xl flex-grow">
            ${content}
        </main>
        <footer class="text-center py-12 text-sm text-gray-600 space-y-3">
            <p>
                <a href="https://github.com/glidea/one-balance" target="_blank" rel="noopener noreferrer" class="hover:text-blue-600 transition-colors duration-300 font-medium">
                    one-balance on GitHub
                </a>
            </p>
            <p>
                <a href="https://github.com/glidea/zenfeed" target="_blank" rel="noopener noreferrer" class="hover:text-blue-600 transition-colors duration-300 font-medium">
                    zenfeed &mdash; Make RSS \u{1F4F0} great again with AI \u{1F9E0}\u2728!!
                </a>
            </p>
        </footer>
    </body>
    </html>
    `;
}
__name(layout, "layout");
function loginPage() {
  const content = `
    <div class="flex items-center justify-center min-h-[70vh] relative">
        <div class="absolute top-20 left-1/4 w-32 h-32 bg-blue-200/30 rounded-full blur-3xl floating-element"></div>
        <div class="absolute bottom-20 right-1/4 w-40 h-40 bg-amber-200/30 rounded-full blur-3xl floating-element" style="animation-delay: -3s;"></div>
        
        <div class="max-w-md w-full mx-6 relative z-10">
            <div class="text-center mb-16">
                <div class="pulse-glow inline-block p-6 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-3xl mb-6">
                    <h1 class="text-6xl font-bold">\u2696\uFE0F</h1>
                </div>
                <h2 class="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-3">One Balance</h2>
                <p class="text-gray-600 text-lg">Manage your API keys with perfect balance</p>
            </div>
            
            <div class="glass-card-warm rounded-3xl p-10 transition-all duration-500 hover:scale-[1.02]">
                <form action="/login" method="POST" class="space-y-8">
                    <div>
                        <label for="auth_key" class="block text-gray-800 text-sm font-bold mb-4 tracking-wide">Authentication Key</label>
                        <input type="password" id="auth_key" name="auth_key" 
                               class="input-field w-full px-5 py-4 rounded-2xl text-gray-900 placeholder-gray-500 focus:outline-none text-base font-medium" 
                               placeholder="Enter your auth key" required>
                    </div>
                    <button type="submit" class="btn-primary w-full py-4 px-6 text-white font-bold rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-200 text-base tracking-wide">
                        Sign In
                    </button>
                </form>
            </div>
        </div>
    </div>
    `;
  return layout(content);
}
__name(loginPage, "loginPage");
function providersPage() {
  const providerLinks = PROVIDERS.map((p, index2) => {
    const config = PROVIDER_CONFIGS[p];
    return `
            <div class="glass-card rounded-3xl p-8 transition-all duration-500 hover:cursor-pointer group hover:shadow-2xl" style="animation-delay: ${index2 * 0.1}s;">
                <a href="/keys/${p}?status=active" class="block">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-5">
                            <div class="relative">
                                <div class="w-14 h-14 bg-gradient-to-br ${config.bgColor} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-lg">
                                    <div class="w-8 h-8 bg-gradient-to-br ${config.color} rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-inner">
                                        ${config.icon}
                                    </div>
                                </div>
                                <div class="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-br ${config.color} rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors duration-300 mb-1">${p}</h3>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="w-2 h-2 bg-gradient-to-r ${config.color} rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
                            <svg class="w-6 h-6 text-gray-400 transform transition-all duration-300 group-hover:translate-x-2 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                            </svg>
                        </div>
                    </div>
                </a>
            </div>
        `;
  }).join("");
  const content = `
        <div class="text-center mb-20 relative">
            <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-8 w-64 h-32 bg-gradient-to-r from-blue-200/20 to-purple-200/20 rounded-full blur-3xl"></div>
            <h1 class="text-6xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-gray-900 bg-clip-text text-transparent mb-6 relative">Select Provider</h1>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 max-w-7xl mx-auto">
            ${providerLinks}
        </div>
    `;
  return layout(content);
}
__name(providersPage, "providersPage");
function keysListPage(provider, currentStatus, q, keys2, total, page, pageSize, sortBy, sortOrder) {
  const content = `
        ${buildBreadcrumb(provider)}
        ${buildKeysTable(provider, currentStatus, q, keys2, total, page, pageSize, sortBy, sortOrder)}
        ${buildAddKeysForm(provider, currentStatus, q, page, sortBy, sortOrder)}
        ${buildModelCoolingsModal()}
        ${buildModalScript()}
    `;
  return layout(content);
}
__name(keysListPage, "keysListPage");
function buildBreadcrumb(provider) {
  return `
        <div class="mb-8">
            <nav class="flex items-center space-x-2 text-sm text-gray-600 mb-4">
                <a href="/" class="hover:text-blue-600 transition-colors duration-200 font-medium">Providers</a>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
                <span class="text-gray-900 font-semibold">${provider}</span>
            </nav>
        </div>
    `;
}
__name(buildBreadcrumb, "buildBreadcrumb");
function buildKeysTable(provider, currentStatus, q, keys2, total, page, pageSize, sortBy, sortOrder) {
  const statusTabs = buildStatusTabs(provider, currentStatus, q, sortBy, sortOrder);
  const keyRows = buildKeyRows(keys2);
  const paginationControls = buildPaginationControls(
    provider,
    currentStatus,
    q,
    page,
    pageSize,
    total,
    sortBy,
    sortOrder
  );
  return `
        <div class="glass-card bg-white/80 rounded-3xl shadow-xl border border-gray-200 overflow-hidden mb-8 max-w-5xl mx-auto backdrop-blur-xl">
            <form method="POST">
                ${buildTableHeader(provider, currentStatus, q, statusTabs, sortBy, sortOrder)}
                ${buildTableContent(keyRows, provider, currentStatus, q, sortBy, sortOrder)}
                ${buildTableFooter(total, paginationControls)}
            </form>
            ${buildSearchForm(provider, currentStatus)}
        </div>
    `;
}
__name(buildKeysTable, "buildKeysTable");
function buildStatusTabs(provider, currentStatus, q, sortBy, sortOrder) {
  const statuses = ["active", "blocked"];
  return statuses.map((s) => {
    const isActive = s === currentStatus;
    const activeClasses = isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-600" : "bg-white/80 text-gray-800 hover:bg-white border border-gray-300 hover:border-gray-400";
    const link = buildPageLink(provider, s, q, 1, 20, sortBy, sortOrder);
    return `<a href="${link}" class="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeClasses}">${s.charAt(0).toUpperCase() + s.slice(1)}</a>`;
  }).join("");
}
__name(buildStatusTabs, "buildStatusTabs");
function buildKeyRows(keys2) {
  if (keys2.length === 0) {
    return buildEmptyState();
  }
  return keys2.map((k) => {
    const usedTime = formatUsedTime(k.createdAt);
    const totalCoolingTime = formatCoolingTime(k.totalCoolingSeconds);
    const modelCoolingsJson = JSON.stringify(k.modelCoolings || {}).replace(/"/g, "&quot;");
    return `
            <tr class="group hover:bg-blue-100/60 even:bg-slate-100/40 odd:bg-white/60 transition-all duration-300 hover:shadow-md backdrop-blur-sm border-b border-gray-300/50">
                <td class="p-4">
                    <input type="checkbox" name="key_id" value="${k.id}" 
                           class="h-4 w-4 text-blue-600 bg-white border-gray-500 rounded focus:ring-blue-500 focus:ring-2 transition-colors backdrop-blur-sm">
                </td>
                <td class="p-4">
                    ${buildCopyableKey(k.key)}
                </td>
                <td class="p-4 text-sm text-slate-700 font-medium">${k.remark || ""}</td>
                <td class="p-4">
                    <span class="text-sm text-slate-800 cursor-pointer hover:text-blue-700 transition-colors duration-200 font-medium px-2 py-1 rounded-md hover:bg-blue-100/80 backdrop-blur-sm" 
                          onclick="showModelCoolings('${modelCoolingsJson}', '${k.key.substring(0, 20)}...')"
                          title="Click to view model cooling details">${totalCoolingTime}</span>
                </td>
                <td class="p-4 text-sm text-slate-700 font-medium">${usedTime}</td>
            </tr>
        `;
  }).join("");
}
__name(buildKeyRows, "buildKeyRows");
function buildEmptyState() {
  return `
        <tr>
            <td colspan="4" class="text-center p-12 text-gray-700 bg-slate-100/40 backdrop-blur-sm">
                <div class="flex flex-col items-center gap-3">
                    <svg class="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
                    </svg>
                    <p class="font-medium">No keys found</p>
                </div>
            </td>
        </tr>
    `;
}
__name(buildEmptyState, "buildEmptyState");
function buildCopyableKey(key) {
  const displayKey = `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  return `
        <div class="relative inline-block">
            <code class="px-3 py-2 bg-slate-200/80 border border-slate-300/70 rounded-lg text-sm font-mono text-slate-900 cursor-pointer hover:bg-slate-300/80 hover:border-slate-400/70 transition-all duration-200 inline-block group-hover:shadow-sm backdrop-blur-sm"
                  onclick="copyToClipboard('${key.replace(/'/g, "\\'")}', this)"
                  title="Click to copy">
                <span class="font-mono">${displayKey}</span>
            </code>
            <div class="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-emerald-700 text-white text-xs px-2 py-1 rounded opacity-0 pointer-events-none transition-opacity duration-300 whitespace-nowrap copy-tooltip backdrop-blur-sm">
                Copied!
            </div>
        </div>
    `;
}
__name(buildCopyableKey, "buildCopyableKey");
function buildPaginationControls(provider, currentStatus, q, page, pageSize, total, sortBy, sortOrder) {
  const numPages = Math.ceil(total / pageSize);
  if (numPages <= 1) {
    return "";
  }
  const pageNumbers = generatePageNumbers(page, numPages);
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(numPages, page + 1);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= numPages;
  const items = [
    buildPaginationButton("prev", prevPage, prevDisabled, provider, currentStatus, q, sortBy, sortOrder),
    ...pageNumbers.map((p) => buildPageNumberButton(p, page, provider, currentStatus, q, sortBy, sortOrder)),
    buildPaginationButton("next", nextPage, nextDisabled, provider, currentStatus, q, sortBy, sortOrder)
  ];
  return items.join("");
}
__name(buildPaginationControls, "buildPaginationControls");
function generatePageNumbers(currentPage, totalPages) {
  const window = 2;
  const pagesToShow = /* @__PURE__ */ new Set();
  pagesToShow.add(1);
  pagesToShow.add(totalPages);
  for (let i = Math.max(1, currentPage - window); i <= Math.min(totalPages, currentPage + window); i++) {
    pagesToShow.add(i);
  }
  const sortedPages = Array.from(pagesToShow).sort((a, b) => a - b);
  const pageItems = [];
  let lastPage = 0;
  for (const p of sortedPages) {
    if (lastPage > 0 && p > lastPage + 1) {
      pageItems.push("...");
    }
    pageItems.push(p);
    lastPage = p;
  }
  return pageItems;
}
__name(generatePageNumbers, "generatePageNumbers");
function buildPaginationButton(type, targetPage, disabled, provider, status, q, sortBy, sortOrder) {
  const icon = type === "prev" ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>' : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>';
  const link = buildPageLink(provider, status, q, targetPage, 20, sortBy, sortOrder);
  const baseClasses = "p-2 rounded-lg text-sm font-medium transition-all duration-200";
  const disabledClasses = "bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300 pointer-events-none";
  const enabledClasses = "bg-white text-gray-800 hover:bg-gray-50 border border-gray-300 hover:border-gray-400 shadow-sm";
  return `
        <a href="${disabled ? "#" : link}" 
                class="${baseClasses} ${disabled ? disabledClasses : enabledClasses}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${icon}
            </svg>
        </a>
    `;
}
__name(buildPaginationButton, "buildPaginationButton");
function buildPageNumberButton(pageItem, currentPage, provider, status, q, sortBy, sortOrder) {
  if (typeof pageItem === "string") {
    return `<span class="px-3 py-2 text-sm font-medium text-gray-500">...</span>`;
  }
  const isCurrent = pageItem === currentPage;
  const link = buildPageLink(provider, status, q, pageItem, 20, sortBy, sortOrder);
  const baseClasses = "px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200";
  const currentClasses = "bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-600 pointer-events-none";
  const otherClasses = "bg-white text-gray-800 hover:bg-gray-50 border border-gray-300 hover:border-gray-400 shadow-sm";
  return `
        <a href="${isCurrent ? "#" : link}" 
                class="${baseClasses} ${isCurrent ? currentClasses : otherClasses}">
            ${pageItem}
        </a>
    `;
}
__name(buildPageNumberButton, "buildPageNumberButton");
function buildPageLink(provider, status, q, page, pageSize, sortBy, sortOrder) {
  const params = new URLSearchParams();
  params.set("status", status);
  if (q) {
    params.set("q", q);
  }
  if (sortBy) {
    params.set("sort_by", sortBy);
    params.set("sort_order", sortOrder);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  return `/keys/${provider}?${params.toString()}`;
}
__name(buildPageLink, "buildPageLink");
function formatUsedTime(createdAt) {
  const now = Date.now() / 1e3;
  const usedSeconds = now - createdAt.getTime() / 1e3;
  const days = Math.floor(usedSeconds / 86400);
  const hours = Math.floor(usedSeconds % 86400 / 3600);
  const minutes = Math.floor(usedSeconds % 3600 / 60);
  if (days > 0) {
    return `${days}d${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  return `${minutes}m`;
}
__name(formatUsedTime, "formatUsedTime");
function formatCoolingTime(totalSeconds) {
  if (totalSeconds === 0) return "-";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds % 86400 / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  if (days > 0) {
    return `${days}d${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  return `${minutes}m`;
}
__name(formatCoolingTime, "formatCoolingTime");
function buildTableHeader(provider, currentStatus, q, statusTabs, sortBy, sortOrder) {
  const deleteAllButton = currentStatus === "blocked" ? `
        <button type="submit" name="action" value="delete-all-blocked"
                onclick="return confirm('Are you sure you want to delete ALL blocked keys? This action cannot be undone.')"
                class="px-4 py-2.5 bg-red-800 hover:bg-red-900 text-white font-semibold rounded-xl text-sm transition-all duration-200 hover:shadow-lg hover:shadow-red-800/25 hover:-translate-y-0.5 border border-red-800">
            Delete ALL Blocked
        </button>
    ` : currentStatus === "active" ? `
        <button type="submit" name="action" value="delete-all-active"
                onclick="return confirm('Are you sure you want to delete ALL active keys? This action cannot be undone.')"
                class="px-4 py-2.5 bg-red-800 hover:bg-red-900 text-white font-semibold rounded-xl text-sm transition-all duration-200 hover:shadow-lg hover:shadow-red-800/25 hover:-translate-y-0.5 border border-red-800">
            Delete ALL Active
        </button>
    ` : "";
  return `
        <div class="p-6 border-b border-gray-200/60 bg-white/30 backdrop-blur-sm">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div class="flex gap-2">${statusTabs}</div>
                    <div class="flex items-center">
                        <div class="relative">
                            <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                            </svg>
                            <input form="search-form" type="search" name="q" value="${q}" 
                                   placeholder="Search keys..." 
                                   class="input-field w-64 pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none text-sm shadow-sm">
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="submit" name="action" value="delete" 
                            class="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-all duration-200 hover:shadow-lg hover:shadow-red-600/25 hover:-translate-y-0.5 border border-red-600">
                        Delete Selected
                    </button>
                    ${deleteAllButton}
                </div>
            </div>
        </div>
    `;
}
__name(buildTableHeader, "buildTableHeader");
function getSortParamsForNextLink(column, currentSortBy, currentSortOrder) {
  let nextSortOrder = "desc";
  if (currentSortBy === column) {
    nextSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
  }
  return { sortBy: column, sortOrder: nextSortOrder };
}
__name(getSortParamsForNextLink, "getSortParamsForNextLink");
function buildTableContent(keyRows, provider, currentStatus, q, sortBy, sortOrder) {
  const coolingSortParams = getSortParamsForNextLink("totalCoolingSeconds", sortBy, sortOrder);
  const coolingLink = buildPageLink(
    provider,
    currentStatus,
    q,
    1,
    20,
    coolingSortParams.sortBy,
    coolingSortParams.sortOrder
  );
  const usedTimeSortParams = getSortParamsForNextLink("createdAt", sortBy, sortOrder);
  const usedTimeLink = buildPageLink(
    provider,
    currentStatus,
    q,
    1,
    20,
    usedTimeSortParams.sortBy,
    usedTimeSortParams.sortOrder
  );
  return `
        <div class="overflow-x-auto">
            <table class="w-full table-fixed">
                <colgroup>
                    <col class="w-12">
                    <col class="w-64">
                    <col class="w-48">
                    <col class="w-32">
                    <col class="w-24">
                </colgroup>
                <thead>
                    <tr class="bg-gradient-to-r from-slate-100/90 to-gray-100/90 border-b border-gray-400/80 backdrop-blur-sm">
                        <th class="p-4 text-left">
                            <input type="checkbox" 
                                   onchange="document.querySelectorAll('[name=key_id]').forEach(c => c.checked = this.checked)" 
                                   class="h-4 w-4 text-blue-600 bg-white border-gray-500 rounded focus:ring-blue-500 transition-colors backdrop-blur-sm">
                        </th>
                        <th class="p-4 text-left font-semibold text-slate-800 text-sm tracking-wide">API Key</th>
                        <th class="p-4 text-left font-semibold text-slate-800 text-sm tracking-wide">Remark</th>
                        <th class="p-4 text-left font-semibold text-slate-800 text-sm tracking-wide">
                            <a href="${coolingLink}" class="flex items-center gap-2 hover:text-blue-700 transition-colors duration-200">
                                <span>Cooling Time</span>
                                ${getSortIcon("totalCoolingSeconds", sortBy, sortOrder)}
                            </a>
                        </th>
                        <th class="p-4 text-left font-semibold text-slate-800 text-sm tracking-wide">
                            <a href="${usedTimeLink}" class="flex items-center gap-2 hover:text-blue-700 transition-colors duration-200">
                                <span>Used Time</span>
                                ${getSortIcon("createdAt", sortBy, sortOrder)}
                            </a>
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-300/60">
                    ${keyRows}
                </tbody>
            </table>
        </div>
    `;
}
__name(buildTableContent, "buildTableContent");
function buildTableFooter(total, paginationControls) {
  if (total === 0) {
    return "";
  }
  if (!paginationControls) {
    return `
        <div class="flex justify-center items-center p-6 border-t border-gray-300/80 bg-gray-100/60 backdrop-blur-sm">
            <div class="px-4 py-2 rounded-xl bg-white/90 text-gray-800 text-sm font-semibold border border-gray-300/80 shadow-sm backdrop-blur-sm">
                ${total}
            </div>
        </div>
    `;
  }
  return `
        <div class="flex justify-center items-center p-6 border-t border-gray-300/80 bg-gray-100/60 backdrop-blur-sm">
            <div class="flex items-center gap-2 p-3 bg-white/90 rounded-xl border border-gray-300/80 shadow-sm backdrop-blur-sm">
                ${paginationControls}
                <div class="h-6 w-px bg-gray-300/80"></div>
                <div class="px-3 text-gray-600 text-sm font-semibold">
                    ${total}
                </div>
            </div>
        </div>
    `;
}
__name(buildTableFooter, "buildTableFooter");
function buildSearchForm(provider, currentStatus) {
  return `
        <form id="search-form" method="GET" action="/keys/${provider}" class="hidden">
            <input type="hidden" name="status" value="${currentStatus}">
        </form>
    `;
}
__name(buildSearchForm, "buildSearchForm");
function buildAddKeysForm(provider, currentStatus, q, page, sortBy, sortOrder) {
  return `
        <div class="glass-card bg-white/80 rounded-3xl shadow-xl p-6 border border-gray-200 max-w-5xl mx-auto">
            <div class="flex items-center gap-3 mb-6">
                <div class="p-2 bg-blue-100 rounded-xl border border-blue-200">
                    <svg class="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                </div>
                <h2 class="text-xl font-bold text-gray-900">Add New Keys</h2>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="add">
                <div class="mb-6">
                    <label class="block text-gray-800 text-sm font-semibold mb-3">API Keys</label>
                    <textarea name="keys" 
                              class="input-field w-full p-4 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none font-mono text-sm resize-none shadow-sm" 
                              rows="4" 
                              placeholder="Enter API keys, one per line or separated by commas"></textarea>
                </div>
                <div class="mb-6">
                    <label class="block text-gray-800 text-sm font-semibold mb-3">Remark</label>
                    <input name="remark"
                              class="input-field w-full p-4 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none text-sm shadow-sm"
                              placeholder="Enter remark for these keys (optional)"/>
                </div>
                <div class="flex justify-end">
                    <button type="submit" 
                            formaction="/keys/${provider}${buildPageLink(provider, currentStatus, q, page, 20, sortBy, sortOrder)}" 
                            class="btn-primary px-6 py-3 text-white font-semibold rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-200">
                        Add Keys
                    </button>
                </div>
            </form>
        </div>
    `;
}
__name(buildAddKeysForm, "buildAddKeysForm");
function buildModelCoolingsModal() {
  return `
        <div id="modelCoolingsModal" class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm hidden items-center justify-center z-50" onclick="closeModal(event)">
            <div class="glass-card bg-white rounded-3xl shadow-2xl border border-gray-200 max-w-2xl w-full mx-6 max-h-[80vh] overflow-hidden" onclick="event.stopPropagation()">
                <div class="p-6 border-b border-gray-200 bg-white/80">
                    <div class="flex items-center justify-between">
                        <h3 class="text-xl font-bold text-gray-900">Model Cooling Details</h3>
                        <button onclick="closeModal()" class="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200">
                            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <p class="text-sm text-gray-600 mt-2">Key: <span id="modalKeyName" class="font-mono"></span></p>
                </div>
                <div class="p-6 overflow-y-auto max-h-96">
                    <div id="modelCoolingsTable"></div>
                </div>
            </div>
        </div>
    `;
}
__name(buildModelCoolingsModal, "buildModelCoolingsModal");
function buildModalScript() {
  return `
        <script>
            function showModelCoolings(modelCoolingsJson, keyName) {
                const modalKeyName = document.getElementById('modalKeyName');
                const modalTable = document.getElementById('modelCoolingsTable');
                const modal = document.getElementById('modelCoolingsModal');
                
                modalKeyName.textContent = keyName;
                
                try {
                    const modelCoolings = JSON.parse(modelCoolingsJson);
                    const now = Date.now() / 1000;
                    
                    if (Object.keys(modelCoolings).length === 0) {
                        modalTable.innerHTML = '<p class="text-gray-600 text-center py-8">No model cooling data available</p>';
                    } else {
                        const rows = Object.entries(modelCoolings).map(([model, cooling]) => {
                            const isAvailable = cooling.end_at < now;
                            const remainingTime = isAvailable ? '-' : formatTime(cooling.end_at - now);
                            const totalTime = formatTime(cooling.total_seconds);
                            const statusClass = isAvailable ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
                            const status = isAvailable ? 'available' : 'cooling';
                            
                            return \`
                                <tr class="border-b border-gray-200">
                                    <td class="p-3 font-mono text-sm">\${model}</td>
                                    <td class="p-3 text-sm">\${totalTime}</td>
                                    <td class="p-3 text-sm">\${remainingTime}</td>
                                    <td class="p-3">
                                        <span class="px-2 py-1 rounded-lg text-xs font-medium \${statusClass}">\${status}</span>
                                    </td>
                                </tr>
                            \`;
                        }).join('');
                        
                        modalTable.innerHTML = \`
                            <table class="w-full">
                                <thead>
                                    <tr class="border-b border-gray-200 bg-gray-50">
                                        <th class="p-3 text-left font-semibold text-gray-900">Model</th>
                                        <th class="p-3 text-left font-semibold text-gray-900">Total Cooling Time</th>
                                        <th class="p-3 text-left font-semibold text-gray-900">Remaining Time</th>
                                        <th class="p-3 text-left font-semibold text-gray-900">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${rows}
                                </tbody>
                            </table>
                        \`;
                    }
                } catch (e) {
                    modalTable.innerHTML = '<p class="text-red-600 text-center py-8">Error parsing model cooling data</p>';
                }
                
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
            
            function closeModal(event) {
                if (!event || event.target === event.currentTarget) {
                    const modal = document.getElementById('modelCoolingsModal');
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                }
            }
            
            function formatTime(seconds) {
                if (seconds <= 0) return '-';
                
                const days = Math.floor(seconds / 86400);
                const hours = Math.floor((seconds % 86400) / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                
                if (days > 0) {
                    return \`\${days}d\${hours}h\`;
                }
                if (hours > 0) {
                    return \`\${hours}h\${minutes}m\`;
                }
                return \`\${minutes}m\`;
            }
        <\/script>
    `;
}
__name(buildModalScript, "buildModalScript");
function getSortIcon(column, sortBy, sortOrder) {
  if (sortBy !== column) {
    return `<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
        </svg>`;
  }
  return sortOrder === "asc" ? `<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4"></path>
        </svg>` : `<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H7"></path>
        </svg>`;
}
__name(getSortIcon, "getSortIcon");

// src/index.ts
var index_default = {
  fetch: /* @__PURE__ */ __name(async (request, env, ctx) => {
    try {
      if (new URL(request.url).pathname.startsWith("/api/")) {
        return await handle(request, env, ctx);
      }
      return await handle2(request, env, ctx);
    } catch (e) {
      console.error(e);
      return new Response("Internal Server Error", { status: 500 });
    }
  }, "fetch")
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
