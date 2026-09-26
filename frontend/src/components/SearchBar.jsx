function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="search-container">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />

      {value && (
        <button
          className="clear-search"
          onClick={() => onChange("")}
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default SearchBar;