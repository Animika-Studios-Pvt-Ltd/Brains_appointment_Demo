import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { FONTS } from '../constants/theme';

function resolveManropeFamily(style) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily && String(flat.fontFamily).startsWith('Manrope')) {
    return flat.fontFamily;
  }

  const weight = String(flat.fontWeight || '400').toLowerCase();
  if (weight === '800' || weight === '900') return FONTS.extraBold;
  if (weight === '700' || weight === 'bold') return FONTS.bold;
  if (weight === '600' || weight === 'semibold') return FONTS.semiBold;
  if (weight === '500' || weight === 'medium') return FONTS.medium;
  return FONTS.regular;
}

function patchTextComponent(Component) {
  if (!Component || Component.__manropePatched) return;

  const originalRender = Component.render;
  if (typeof originalRender !== 'function') {
    Component.__manropePatched = true;
    return;
  }

  Component.render = function manropeTextRender(...args) {
    const element = originalRender.apply(this, args);
    if (!React.isValidElement(element)) return element;

    const nextFamily = resolveManropeFamily(element.props.style);
    return React.cloneElement(element, {
      style: [{ fontFamily: nextFamily }, element.props.style],
    });
  };

  Component.__manropePatched = true;
}

/**
 * Apply Manrope as the default font for Text / TextInput across the app.
 * Maps fontWeight → the matching Manrope face so Android doesn't drop weight.
 */
export function applyManropeFont() {
  patchTextComponent(Text);
  patchTextComponent(TextInput);
}
