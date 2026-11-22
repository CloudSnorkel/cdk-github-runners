import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import LanguagePicker from './LanguagePicker.vue';
import ReportIssue from './ReportIssue.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'nav-bar-content-before': () => h(LanguagePicker),
    'nav-screen-content-before': () => h(LanguagePicker),
    'doc-footer-before': () => h(ReportIssue),
  }),
};
